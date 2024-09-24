var _ = require("root/lib/underscore")
var Config = require("root").config
var Path = require("path")
var DateFns = require("date-fns")
var {Router} = require("express")
var HttpError = require("standard-http-error")
var SqliteError = require("root/lib/sqlite_error")
var Subscription = require("root/lib/subscription")
var Initiative = require("root/lib/initiative")
var next = require("co-next")
var sql = require("sqlate")
var outdent = require("root/lib/outdent")
var commentsDb = require("root/db/comments_db")
var {isAdmin} = require("root/lib/user")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var reportsDb = require("root/db/initiative_comment_reports_db")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var {validateRedirect} = require("root/lib/http")
var {sendEmail} = require("root")
var reportError = require("root").errorReporter
var MAX_TITLE_LENGTH = 140
var MAX_TEXT_LENGTH = 3000
var REPORT_THRESHOLD = Config.commentReportNotificationThreshold
exports.MAX_TITLE_LENGTH = MAX_TITLE_LENGTH
exports.MAX_TEXT_LENGTH = MAX_TEXT_LENGTH
exports.getCommentAuthorName = getCommentAuthorName
exports.canAnonymize = canAnonymize
exports.router = Router({mergeParams: true})

var CONSTRAINT_ERRORS = {
	comments_title_present: [
		"INITIATIVE_COMMENT_TITLE_LENGTH_ERROR", {max: MAX_TITLE_LENGTH}
	],

	comments_title_length: [
		"INITIATIVE_COMMENT_TITLE_LENGTH_ERROR", {max: MAX_TITLE_LENGTH}
	],

	comments_text_length: [
		"INITIATIVE_COMMENT_TEXT_LENGTH_ERROR", {max: MAX_TEXT_LENGTH}
	]
}

exports.router.get("/new", assertUser, function(_req, res) {
	res.render("initiatives/comments/create_page.jsx")
})

exports.router.post("/", assertUser, rateLimit, next(function*(req, res) {
	var {t, user, initiative} = req

	var userEmail = user.email || ""
	var parse = isAdmin(user) ? parseCommentAsAdmin : parseComment

	var attrs = _.assign(parse(req.body), {
		initiative_uuid: initiative.uuid,
		user_id: user.id,
		user_uuid: _.serializeUuid(user.uuid),
		created_at: new Date,
		updated_at: new Date
	})

	try {
		var comment = commentsDb.create(attrs)
		var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
		var subscribe = _.parseTrilean(req.body.subscribe)

		if (subscribe != null && user.email) {
			var subscription = subscriptionsDb.read(sql`
				SELECT * FROM initiative_subscriptions
				WHERE (initiative_uuid, email) = (${initiative.uuid}, ${userEmail})
			`)

			if (subscription) subscriptionsDb.update(subscription, {
				comment_interest: subscribe,
				updated_at: new Date,
				confirmed_at: new Date
			})
			else if (subscribe) subscriptionsDb.create({
				email: user.email,
				initiative_uuid: initiative.uuid,
				event_interest: false,
				comment_interest: true,
				created_at: new Date,
				created_ip: req.ip,
				updated_at: new Date,
				confirmed_at: new Date
			})
		}

		if (initiative.published_at) {
			var subs =
				subscriptionsDb.searchConfirmedByInitiativeForComment(initiative).
				filter((sub) => sub.email != userEmail)

			yield Subscription.send({
				title: req.t("EMAIL_INITIATIVE_COMMENT_TITLE", {
					initiativeTitle: initiative.title,
				}),

				text: renderEmail("EMAIL_INITIATIVE_COMMENT_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: initiativeUrl,
					userName: getCommentAuthorName(t, comment, user),
					commentTitle: comment.title.replace(/\r?\n/g, " "),
					commentText: _.quoteEmail(comment.text),
					commentUrl: initiativeUrl + "#comment-" + comment.id
				})
			}, subs)
		}

		res.statusMessage = "Comment Created"

		res.redirect(303, validateRedirect(
			req,
			req.body.referrer ? req.body.referrer + "#comment-" + comment.id : null,
			req.baseUrl + "/" + comment.id
		))
	}
	catch (err) {
		if (err instanceof SqliteError && err.code == "constraint") {
			res.status(422)
			res.flash("error", req.t.apply(null, CONSTRAINT_ERRORS[err.constraint]))

			res.render("initiatives/comments/create_page.jsx", {
				referrer: req.body.referrer,
				newComment: attrs
			})
		}
		else throw err
	}
}))

exports.router.use("/:commentId", function(req, res, next) {
	var id = req.params.commentId
	var {user} = req
	var {initiative} = req
	var baseUrl = Path.dirname(req.baseUrl)

	var comment = commentsDb.read(sql`
		SELECT
			comment.*,
			user.name AS user_name,
			report.created_at AS reported_at

		FROM comments AS comment

		LEFT JOIN users AS user
		ON comment.user_id = user.id
		AND comment.anonymized_at IS NULL
		AND NOT comment.as_admin

		LEFT JOIN initiative_comment_reports AS report
		ON report.comment_id = comment.id
		AND report.created_by_id = ${user && user.id}

		WHERE (comment.id = ${id} OR comment.uuid = ${id})
		AND comment.initiative_uuid = ${initiative.uuid}
	`)

	if (comment == null)
		throw new HttpError(404)
	if (comment.uuid == id)
		return void res.redirect(308, baseUrl + "/" + comment.id)

	req.comment = comment
	next()
})

exports.router.get("/:commentId", function(req, res) {
	var {comment} = req

	if (comment.parent_id)
		return void res.redirect(302, req.baseUrl + "/" + comment.parent_id)

	renderComment(req, res)
})

exports.router.delete("/:commentId", assertUser, function(req, res) {
	var {user, comment} = req
	// Don't reveal that we're not the author if a comment's anonymized.
	if (comment.anonymized_at) throw new HttpError(405, "Already Anonymized")
	if (comment.user_id != user.id) throw new HttpError(403, "Not Author")

	if (!canAnonymize(new Date, comment))
		throw new HttpError(405, "Cannot Yet Anonymize")

	commentsDb.update(comment, {anonymized_at: new Date})

	res.flash("notice", req.t("comment_page.comment_anonymized"))
	res.statusMessage = "Comment Anonymized"

	res.redirect(303, req.baseUrl + "/" + (comment.parent_id
		? comment.parent_id + "#comment-" + comment.id
		: comment.id
	))
})

exports.router.post("/:commentId/replies",
	assertUser,
	rateLimit,
	next(function*(req, res) {
	var {t, user, initiative} = req

	var parent = req.comment
	if (parent.parent_id) throw new HttpError(405)

	var parse = isAdmin(user) ? parseCommentAsAdmin : parseComment
	var attrs = _.assign(parse(req.body), {
		initiative_uuid: parent.initiative_uuid,
		parent_id: parent.id,
		user_id: user.id,
		user_uuid: _.serializeUuid(user.uuid),
		created_at: new Date,
		updated_at: new Date,
		title: ""
	})

	try {
		var reply = commentsDb.create(attrs)
		var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
		var userEmail = user.email || ""

		if (initiative.published_at) {
			var subs =
				subscriptionsDb.searchConfirmedByInitiativeForComment(initiative).
				filter((sub) => sub.email != userEmail)

			yield Subscription.send({
				title: req.t("EMAIL_INITIATIVE_COMMENT_REPLY_TITLE", {
					initiativeTitle: initiative.title,
				}),

				text: renderEmail("EMAIL_INITIATIVE_COMMENT_REPLY_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: initiativeUrl,
					userName: getCommentAuthorName(t, reply, user),
					commentText: _.quoteEmail(reply.text),
					commentUrl: initiativeUrl + "#comment-" + reply.id
				})
			}, subs)
		}

		res.statusMessage = "Comment Reply Created"

		res.redirect(303, validateRedirect(
			req,
			req.body.referrer ? req.body.referrer : null,
			req.baseUrl + "/" + parent.id
		) + "#comment-" + reply.id)
	}
	catch (err) {
		if (err instanceof SqliteError && err.code == "constraint") {
			res.status(422)
			res.flash("error", req.t.apply(null, CONSTRAINT_ERRORS[err.constraint]))
			res.locals.newComment = attrs
			renderComment(req, res)
		}
		else throw err
	}
}))

exports.router.post("/:commentId/reports", assertUser,
	next(function*(req, res) {
	var {user} = req
	var {initiative} = req
	var {comment} = req

	try {
		reportsDb.create_({
			initiative_id: initiative.id,
			comment_id: comment.id,
			created_at: new Date,
			created_by_id: user.id
		})

		res.statusMessage = "Comment Reported"
		res.flash("notice", req.t("comment_page.comment_reported"))

		var {count} = reportsDb.select1(sql`
			SELECT COUNT(*) AS count
			FROM initiative_comment_reports
			WHERE comment_id = ${comment.id}
		`)

		if (count == REPORT_THRESHOLD) yield sendEmail({
			envelope: {to: Config.helpEmail},
			to: {name: "", address: Config.helpEmail},
			subject: "Comment reported on " + initiative.title,

			text: outdent`
				Hi,

				A comment on "${initiative.title}" was reported at least ${REPORT_THRESHOLD}.
				Moderate the comment at ${Config.adminUrl + "/comments/" + comment.id}.

				See the initiative at ${Initiative.url(initiative)}.

				Rahvaalgatus
				${Config.url}
			`
		}).catch(reportError)
	}
	catch (ex) {
		if (
			ex instanceof SqliteError &&
			ex.code == "constraint" &&
			ex.type == "unique" &&
			_.deepEquals(ex.columns, ["comment_id", "created_by_id"])
		) {
			res.statusMessage = "Comment Already Reported"
			res.flash("notice", req.t("comment_page.comment_already_reported"))
		}
		else throw ex
	}

	res.redirect(303, req.baseUrl + "/" + (comment.parent_id
		? comment.parent_id + "#comment-" + comment.id
		: comment.id
	))
}))

function assertUser(req, _res, next) {
	if (req.user == null) throw new HttpError(401)
	next()
}

function rateLimit(req, res, next) {
	var {user} = req

	var comments = commentsDb.search(sql`
		SELECT created_at FROM comments
		WHERE user_id = ${user.id}
		AND created_at > ${DateFns.addMinutes(new Date, -15)}
		ORDER BY created_at ASC
		LIMIT 10
	`)

	var until = comments.length < 10
		? null
		: DateFns.addMinutes(comments[0].created_at, 15)

	if (until) {
		res.statusCode = 429
		res.statusMessage = "Too Many Comments"

		var minutes = Math.max(DateFns.differenceInMinutes(until, new Date), 1)

		res.render("error_page.jsx", {
			title: req.t("INITIATIVE_COMMENT_RATE_LIMIT_TITLE", {minutes: minutes}),
			body: req.t("INITIATIVE_COMMENT_RATE_LIMIT_BODY", {minutes: minutes})
		})
	}
	else next()
}

function renderComment(req, res) {
	var {user} = req
	var {comment} = req

	comment.replies = commentsDb.search(sql`
		SELECT
			comment.*,
			user.name AS user_name,
			report.created_at AS reported_at

		FROM comments AS comment

		LEFT JOIN users AS user
		ON comment.user_id = user.id
		AND comment.anonymized_at IS NULL
		AND NOT comment.as_admin

		LEFT JOIN initiative_comment_reports AS report
		ON report.comment_id = comment.id
		AND report.created_by_id = ${user && user.id}

		WHERE parent_id = ${comment.id}
	`)

	res.render("initiatives/comments/read_page.jsx", {comment})
}

function parseComment(obj) {
	return {
		title: String(obj.title || ""),
		text: normalizeNewlines(String(obj.text || ""))
	}
}

function parseCommentAsAdmin(obj) {
	var attrs = parseComment(obj)
	attrs.as_admin = obj.persona == "admin"
	return attrs
}

function getCommentAuthorName(t, comment, user) {
	if (comment.as_admin) return t("comment_page.comment.admin_author")
	if (comment.anonymized_at) return t("comment_page.comment.hidden_author")
	return user && user.name || comment.user_name
}

function canAnonymize(now, comment) {
	return now - comment.created_at >= 3600 * 1000
}

function normalizeNewlines(text) { return text.replace(/\r\n/g, "\n") }

var _ = require("root/lib/underscore")
var Config = require("root/config")
var Path = require("path")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var SqliteError = require("root/lib/sqlite_error")
var Subscription = require("root/lib/subscription")
var next = require("co-next")
var sql = require("sqlate")
var cosDb = require("root").cosDb
var commentsDb = require("root/db/comments_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var concat = Array.prototype.concat.bind(Array.prototype)
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var MAX_TITLE_LENGTH = 140
var MAX_TEXT_LENGTH = 3000
exports.MAX_TITLE_LENGTH = MAX_TITLE_LENGTH
exports.MAX_TEXT_LENGTH = MAX_TEXT_LENGTH
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

exports.router.get("/new", function(_req, res) {
	res.render("initiatives/comments/create_page.jsx")
})

exports.router.post("/", next(function*(req, res) {
	var user = req.user
	var initiative = req.initiative
	if (user == null) throw new HttpError(401)

	var attrs = _.assign(parseComment(req.body), {
		initiative_uuid: initiative.id,
		user_uuid: user.id,
		created_at: new Date,
		updated_at: new Date
	})

	try {
		var comment = yield commentsDb.create(attrs)
		var initiativeUrl = `${Config.url}/initiatives/${initiative.id}`

		yield Subscription.send({
			title: req.t("EMAIL_INITIATIVE_COMMENT_TITLE", {
				initiativeTitle: initiative.title,
			}),

			text: renderEmail("EMAIL_INITIATIVE_COMMENT_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: initiativeUrl,
				userName: user.name,
				commentTitle: comment.title.replace(/\r?\n/g, " "),
				commentText: _.quoteEmail(comment.text),
				commentUrl: initiativeUrl + "#comment-" + comment.id
			})
		}, yield subscriptionsDb.searchConfirmedByInitiativeIdForComment(
			initiative.id
		))

		var url = req.baseUrl + "/" + comment.id
		if (req.body.referrer) url = req.body.referrer + "#comment-" + comment.id
		res.redirect(303, url)
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

exports.router.use("/:commentId", next(function*(req, res, next) {
	var id = req.params.commentId
	var initiative = req.initiative
	var baseUrl = Path.dirname(req.baseUrl)

	var comment = yield commentsDb.read(sql`
		SELECT * FROM comments
		WHERE (id = ${id} OR uuid = ${id})
		AND initiative_uuid = ${initiative.id}
	`)

	if (comment == null)
		throw new HttpError(404)
	if (comment.uuid == id)
		return void res.redirect(308, baseUrl + "/" + comment.id)
	
	req.comment = comment
	next()
}))

exports.router.get("/:commentId", next(function*(req, res) {
	var comment = req.comment

	if (comment.parent_id)
		return void res.redirect(302, req.baseUrl + "/" + comment.parent_id)

	yield renderComment(req, res)
}))

exports.router.post("/:commentId/replies", next(function*(req, res) {
	var user = req.user
	var initiative = req.initiative
	var comment = req.comment
	if (user == null) throw new HttpError(401)
	if (comment.parent_id) throw new HttpError(405)

	var attrs = _.assign(parseComment(req.body), {
		initiative_uuid: comment.initiative_uuid,
		parent_id: comment.id,
		user_uuid: user.id,
		created_at: new Date,
		updated_at: new Date,
		title: ""
	})

	try {
		var reply = yield commentsDb.create(attrs)
		var initiativeUrl = `${Config.url}/initiatives/${initiative.id}`

		yield Subscription.send({
			title: req.t("EMAIL_INITIATIVE_COMMENT_REPLY_TITLE", {
				initiativeTitle: initiative.title,
			}),

			text: renderEmail("EMAIL_INITIATIVE_COMMENT_REPLY_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: initiativeUrl,
				userName: user.name,
				commentText: _.quoteEmail(reply.text),
				commentUrl: initiativeUrl + "#comment-" + reply.id
			})
		}, yield subscriptionsDb.searchConfirmedByInitiativeIdForComment(
			initiative.id
		))

		var url = req.body.referrer || req.baseUrl + "/" + comment.id
		res.redirect(303, url + "#comment-" + reply.id)
	}
	catch (err) {
		if (err instanceof SqliteError && err.code == "constraint") {
			res.status(422)
			res.flash("error", req.t.apply(null, CONSTRAINT_ERRORS[err.constraint]))
			res.locals.newComment = attrs
			yield renderComment(req, res)
		}
		else throw err
	}
}))

function* renderComment(req, res) {
	var comment = req.comment

	var replies = comment.replies = yield commentsDb.search(sql`
		SELECT * FROM comments WHERE parent_id = ${comment.id}
	`)

	var usersById = _.indexBy(yield cosDb.query(sql`
		SELECT id, name FROM "Users"
		WHERE id IN ${
			sql.tuple(concat(comment.user_uuid, replies.map((r) => r.user_uuid)))
		}
	`), "id")

	comment.user = usersById[comment.user_uuid]
	replies.forEach((reply) => reply.user = usersById[reply.user_uuid])
	res.render("initiatives/comments/read_page.jsx", {comment: comment})
}

function parseComment(obj) {
	return {
		title: String(obj.title || ""),
		text: normalizeNewlines(String(obj.text || ""))
	}
}

function normalizeNewlines(text) { return text.replace(/\r\n/g, "\n") }

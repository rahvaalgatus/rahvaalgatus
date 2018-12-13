"use strict"
var _ = require("lodash")
var O = require("oolong")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var Initiative = require("root/lib/initiative")
var DateFns = require("date-fns")
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var MediaType = require("medium-type")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var md5 = require("root/lib/crypto").md5
var db = require("root").db
var countVotes = Initiative.countSignatures.bind(null, "Yes")
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var catch401 = require("root/lib/fetch").catch.bind(null, 401)
var isFetchError = require("root/lib/fetch").is
var next = require("co-next")
var sleep = require("root/lib/promise").sleep
var api = require("root/lib/api")
var parseCitizenInitiative = api.parseCitizenInitiative
var mailchimp = require("root/lib/mailchimp")
var readInitiativesWithStatus = api.readInitiativesWithStatus
var encode = encodeURIComponent
var translateCitizenError = require("root/lib/api").translateError
var hasMainPartnerId = Initiative.hasPartnerId.bind(null, Config.apiPartnerId)
var concat = Array.prototype.concat.bind(Array.prototype)
var EMPTY_ARR = Array.prototype
var EMPTY_INITIATIVE = {title: "", contact: {name: "", email: "", phone: ""}}
var EMPTY_COMMENT = {subject: "", text: "", parentId: null}
var ADMIN_COAUTHORS = Config.adminCoauthors
var ISO8601_DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)\s+/
var LOCAL_DATE = /^(\d\d)\.(\d\d)\.(\d\d\d\d)\s+/

var UI_TRANSLATIONS = O.map(require("root/lib/i18n").STRINGS, function(lang) {
	return O.filter(lang, (_value, key) => key.indexOf("HWCRYPTO") >= 0)
})

var RESPONSE_TYPES = [
	"text/html",
	"application/vnd.rahvaalgatus.initiative+json; v=1"
]

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(_req, res) {
	var initiatives = yield {
		inProgress: readInitiativesWithStatus("inProgress"),
		voting: readInitiativesWithStatus("voting"),
		followUp: readInitiativesWithStatus("followUp"),
		closed: readInitiativesWithStatus("closed"),
	}

	var closed = _.groupBy(initiatives.closed, Initiative.getUnclosedStatus)
	var votings = concat(initiatives.voting, closed.voting || EMPTY_ARR)

	res.render("initiatives/index", {
		discussions: concat(
			initiatives.inProgress,
			(closed.inProgress || EMPTY_ARR).filter(hasMainPartnerId)
		),

		votings: _.sortBy(votings, countVotes).reverse(),
		processes: initiatives.followUp,
		processed: closed.followUp || EMPTY_ARR,
	})
}))

exports.router.post("/", next(function*(req, res) {
	var title = _.escape(req.body.title)
	var attrs = O.assign({}, EMPTY_INITIATIVE, {
		title: req.body.title,
		visibility: "private",

		// NOTE: CitizenOS or Etherpad saves all given whitespace as
		// non-breaking-spaces, so make sure to not have any around <body> or other
		// tags.
		description: req.t("INITIATIVE_DEFAULT_HTML", {title: title}),
	})

	if (!req.body["accept-tos"]) res.render("initiatives/create", {
		error: req.t("CONFIRM_I_HAVE_READ"),
		attrs: attrs
	})

	var created = yield req.api("/api/users/self/topics", {
		method: "POST",
		json: attrs
	}).catch(catch400)

	if (isOk(created)) {
		var initiative = created.body.data
		res.redirect(303, req.baseUrl + "/" + initiative.id + "/edit")
	}
	else res.status(422).render("initiatives/create", {
		error: translateCitizenError(req.t, created.body),
		attrs: attrs
	})
}))

exports.router.get("/new", function(_req, res) {
	res.render("initiatives/create", {attrs: EMPTY_INITIATIVE})
})

exports.router.use("/:id", next(function*(req, res, next) {
	try {
		var path = `/api/topics/${encode(req.params.id)}?include[]=vote&include[]=event`
		if (req.user) path = "/api/users/self" + path.slice(4)
		req.initiative = yield req.api(path).then(getBody).
			then(parseCitizenInitiative)

		req.dbInitiative = yield readOrCreateDbInitiative(req.initiative.id)
	}
	catch (ex) {
		// CitizenOS throws 500 for invalid UUIDs. Workaround that.
		if (isFetchError(403, ex)) throw new HttpError(404)
		if (isFetchError(404, ex)) throw new HttpError(404)
		if (isFetchError(500, ex)) throw new HttpError(404)
		throw ex
	}

	res.locals.initiative = req.initiative
	res.locals.dbInitiative = req.dbInitiative
	next()
}))

exports.router.get("/:id",
	new ResponseTypeMiddeware(RESPONSE_TYPES.map(MediaType)),
	function(req, res, next) {
	var initiative = req.initiative

	switch (res.contentType.name) {
		case "application/vnd.rahvaalgatus.initiative+json":
			res.setHeader("Content-Type", res.contentType)
			res.send({
				title: initiative.title,
				signatureCount: initiative.vote ? countVotes(initiative) : 0
			})
			break

		default: next()
	}
})

exports.read = next(function*(req, res) {
	var initiative = req.initiative
	var events

	var commentsPath = `/api/topics/${initiative.id}/comments?orderBy=date`
	if (req.user) commentsPath = "/api/users/self" + commentsPath.slice(4)
	var comments = yield req.api(commentsPath)
	comments = comments.body.data.rows.map(normalizeComment).reverse()

	if (initiative.vote && (
		initiative.status == "followUp" ||
		initiative.status == "closed"
	)) {
		var eventsPath = `/api/topics/${initiative.id}/events`
		if (req.user) eventsPath = "/api/users/self" + eventsPath.slice(4)
		events = yield req.api(eventsPath)
		events = events.body.data.rows.map(parseCitizenEvent)
		events = events.sort((a, b) => +b.createdAt - +a.createdAt)
	}
	else events = EMPTY_ARR

	res.render("initiatives/read", {
		comments: comments,
		comment: res.locals.comment || EMPTY_COMMENT,
		events: events,
		translations: UI_TRANSLATIONS[req.lang]
	})
})

exports.router.get("/:id", exports.read)

exports.router.put("/:id", next(function*(req, res) {
	var initiative = req.initiative
	var unclosedStatus = Initiative.getUnclosedStatus(initiative)
	res.locals.subpage = unclosedStatus == "inProgress" ? "discussion" : "vote"

	var tmpl
	var method = "PUT"
	var path = `/api/users/self/topics/${initiative.id}`
	var attrs = EMPTY_INITIATIVE

	if (req.body.visibility === "public") {
		tmpl = "initiatives/update_for_publish"
		if (!(
			Initiative.canPublish(initiative) ||
			Initiative.canUpdateDiscussionDeadline(initiative)
		)) throw new HttpError(401)

		if (req.body.endsAt == null) return void res.render(tmpl, {
			attrs: {endsAt: initiative.endsAt && new Date(initiative.endsAt)}
		})

		let endsAt = DateFns.endOfDay(new Date(req.body.endsAt))
		if (!Initiative.isDeadlineOk(new Date, endsAt))
			return void res.render(tmpl, {
				error: req.t("DEADLINE_ERR", {days: Config.minDeadlineDays}),
				attrs: {endsAt: endsAt}
			})

		attrs = {visibility: "public", endsAt: endsAt}
	}
	else if (req.body.status === "voting") {
		tmpl = "initiatives/update_for_voting"
		if (!(
			Initiative.canPropose(new Date, initiative) ||
			Initiative.canUpdateVoteDeadline(initiative)
		)) throw new HttpError(401)

		if (req.body.endsAt == null) return void res.render(tmpl, {
			attrs: {endsAt: initiative.vote ? new Date(initiative.vote.endsAt) : null}
		})

		let endsAt = DateFns.endOfDay(new Date(req.body.endsAt))
		if (!Initiative.isDeadlineOk(new Date, endsAt))
			return void res.render(tmpl, {
				error: req.t("DEADLINE_ERR", {days: Config.minDeadlineDays}),
				attrs: {endsAt: endsAt}
			})

		if (initiative.vote) {
			method = "PUT"
			path += `/votes/${initiative.vote.id}`
			attrs = {endsAt: endsAt}
		}
		else {
			method = "POST"
			path += "/votes"
			attrs = {
				endsAt: endsAt,
				authType: "hard",
				voteType: "regular",
				delegationIsAllowed: false,
				options: [{value: "Yes"}, {value: "No"}]
			}
		}
	}
	else if (req.body.status === "followUp") {
		tmpl = "initiatives/update_for_parliament"
		if (!Initiative.canSendToParliament(initiative)) throw new HttpError(401)
		if (req.body.contact == null) return void res.render(tmpl, {attrs: attrs})

		attrs = {
			status: req.body.status,
			contact: O.defaults(req.body.contact, EMPTY_INITIATIVE.contact)
		}
	}
	else if (req.body.status === "closed") {
		if (!Initiative.canFinish(initiative)) throw new HttpError(401)
		attrs = {status: req.body.status}
	}
	else if ("notes" in req.body) {
		if (!Initiative.canEdit(initiative)) throw new HttpError(401)

		yield db.update(`
			UPDATE initiatives
			SET notes = $notes
			WHERE uuid = $uuid
		`, {
			$uuid: initiative.id,
			$notes: String(req.body.notes).trim()
		})

		res.flash("notice", req.t("NOTES_UPDATED"))
		res.redirect(303, req.baseUrl + "/" + initiative.id + "/edit")
		return
	}
	else throw new HttpError(422, "Invalid Attribute")

	var updated = yield req.api(path, {
		method: method,
		json: attrs
	}).catch(catch400)

	if (isOk(updated)) {
		if (req.body.visibility === "public")
			res.flash("notice", "Algatus on nüüd avalik.")
		else if (req.body.status === "voting")
			res.flash("notice", "Algatus on avatud allkirjade kogumiseks.")
		else if (req.body.status === "followUp")
			res.flash("notice", req.t("SENT_TO_PARLIAMENT_CONTENT"))
		else if (req.body.status === "closed")
			res.flash("notice", "Algatuse menetlus on lõpetatud.")

		if (req.body.visibility === "public" && ADMIN_COAUTHORS.length > 0)
			yield req.api(`/api/users/self/topics/${initiative.id}/members/users`, {
				method: "POST",
				json: ADMIN_COAUTHORS.map((email) => ({userId: email, level: "admin"}))
			}).catch(_.noop)

		res.redirect(303, req.baseUrl + "/" + initiative.id)
	}
	else res.status(422).render(tmpl, {
		error: translateCitizenError(req.t, updated.body),
		attrs: attrs
	})
}))

exports.router.delete("/:id", next(function*(req, res) {
	var initiative = req.initiative
	if (!Initiative.canDelete(initiative)) throw new HttpError(405)
	yield req.api(`/api/users/self/topics/${initiative.id}`, {method: "DELETE"})
	res.flash("notice", "Algatus on kustutatud.")
	res.redirect(302, req.baseUrl)
}))

exports.router.get("/:id/edit", function(req, res) {
	if (!Initiative.canEdit(req.initiative)) throw new HttpError(401)
	res.render("initiatives/update")
})

exports.router.use("/:id/comments",
	require("./initiatives/comments_controller").router)
exports.router.use("/:id/events",
	require("./initiatives/events_controller").router)
exports.router.use("/:id/authors",
	require("./initiatives/authors_controller").router)

exports.router.get("/:id/signable", next(function*(req, res) {
	var initiative = req.initiative
	var vote = initiative.vote

	// NOTE: Do not send signing requests through the current user. See below for
	// an explanation.
	var signable = yield api(`/api/topics/${initiative.id}/votes/${vote.id}`, {
		method: "POST",

		json: {
			options: [{optionId: req.query.optionId}],
			certificate: req.query.certificate
		}
	}).catch(catch400)

	if (isOk(signable)) res.json({
		token: signable.body.data.token,
		digest: signable.body.data.signedInfoDigest,
		hash: signable.body.data.signedInfoHashType
	})
	else res.status(422).json({
		error: translateCitizenError(req.t, signable.body)
	})
}))

exports.router.post("/:id/signature", next(function*(req, res) {
	var initiative = req.initiative
	var vote = initiative.vote

	res.locals.method = req.body.method

	// NOTE: Do not send signing requests through the current user. CitizenOS API
	// limits signing with one personal id number to a single account,
	// a requirement we don't need to enforce.
	switch (req.body.method) {
		case "id-card":
			var path = `/api/topics/${initiative.id}/votes/${vote.id}/sign`
			var signed = yield api(path, {
				method: "POST",
				json: {token: req.body.token, signatureValue: req.body.signature}
			}).catch(catch400)

			if (isOk(signed)) {
				res.flash("signed", signed.body.data.bdocUri)
				res.redirect(303, req.baseUrl + "/" + initiative.id)
			}
			else res.status(422).render("initiatives/signature/create", {
				error: translateCitizenError(req.t, signed.body)
			})
			break

		case "mobile-id":
			var signing = yield api(`/api/topics/${initiative.id}/votes/${vote.id}`, {
				method: "POST",
				json: {
					options: [{optionId: req.body.optionId}],
					pid: req.body.pid,
					phoneNumber: ensureAreaCode(req.body.phoneNumber),
				}
			}).catch(catch400)

			if (isOk(signing)) {
				res.render("initiatives/signature/create", {
					code: signing.body.data.challengeID,
					poll: req.baseUrl + req.path + "?token=" + signing.body.data.token
				})
			}
			else res.status(422).render("initiatives/signature/create", {
				error: translateCitizenError(req.t, signing.body)
			})
			break

		default: throw new HttpError(422, "Unknown Signing Method")
	}
}))

exports.router.get("/:id/signature", next(function*(req, res) {
	var token = req.query.token
	if (token == null) throw new HttpError(400, "Missing Token")
	var initiative = req.initiative
	var signature = yield readSignature(initiative, token)

	switch (signature.statusCode) {
		case 200:
			// Cannot currently know which option the person signed.
			res.flash("signed", signature.body.data.bdocUri)
			break

		default:
			res.flash("error", translateCitizenError(req.t, signature.body))
			break
	}

	res.redirect(303, req.baseUrl + "/" + initiative.id)
}))

exports.router.post("/:id/subscriptions", next(function*(req, res, next) {
	var initiative = req.initiative
	var dbInitiative = req.dbInitiative

	if (!Initiative.isPublic(initiative))
		return void next(new HttpError(403, "Initiative Not Public"))

	var interestId = yield readOrCreateMailchimpInterest(dbInitiative, initiative)
	var email = req.body.email
	var emailHash = md5(email.toLowerCase())

	try {
		var path = `/3.0/lists/${Config.mailchimpListId}/members/${emailHash}`
		yield mailchimp(path, {
			method: "PUT",
			json: {
				email_address: email,
				status_if_new: "pending",
				interests: {[interestId]: true},
				ip_signup: req.ip
			}
		})
	}
	catch (ex) {
		if (isMailchimpEmailErr(ex)) return void res.status(422).render("422", {
			errors: [req.t("INVALID_EMAIL")]
		})
		else throw ex
	}

	res.flash("notice", req.t("SUBSCRIBED"))
	res.redirect(303, req.baseUrl + "/" + initiative.id)
}))

exports.router.use(function(err, _req, res, next) {
	if (err instanceof HttpError && err.code === 404) {
		res.statusCode = err.code
		res.render("initiatives/404", {error: err})
	}
	else next(err)
})

function* readSignature(initiative, token) {
	var vote = initiative.vote
	var path = `/api/topics/${initiative.id}/votes/${vote.id}/status`
	path += "?token=" + encodeURIComponent(token)

	RETRY: for (var i = 0; i < 60; ++i) {
		// The signature endpoint is valid only for a limited amount of time.
		// If that time passes, 401 is thrown.
		var res = yield api(path).catch(catch400).catch(catch401)

		switch (res.statusCode) {
			case 200:
				if (res.body.status.code === 20001) {
					yield sleep(2500);
					continue RETRY;
				}
				// Fall through.

			default: return res
		}
	}

	throw new HttpError(500, "Mobile-Id Took Too Long")
}

function* readOrCreateMailchimpInterest(dbInitiative, initiative) {
	if (dbInitiative.mailchimp_interest_id)
		return dbInitiative.mailchimp_interest_id
	else
		return yield createMailchimpInterest(initiative)
}

function* createMailchimpInterest(initiative) {
	var path = "/3.0/lists/" + Config.mailchimpListId
	path += "/interest-categories/" + Config.mailchimpInterestCategoryId
	path += "/interests"

	var interest
	try { interest = yield create(initiative.title) }
	catch (err) {
		// Basic fail-safe as interests have to have unique names in Mailchimp.
		if (!isMailchimpNameTakenErr(err)) throw err
		var date = I18n.formatDate("iso", initiative.createdAt)
		interest = yield create(`${initiative.title} (${date})`)
	}

	yield db.update(`
		UPDATE initiatives
		SET mailchimp_interest_id = $interestId
		WHERE uuid = $uuid
	`, {
		$uuid: initiative.id,
		$interestId: interest.body.id
	})

	return interest.body.id

	function create(title) {
		return mailchimp(path, {method: "POST", json: {name: title}})
	}
}

function normalizeComment(comment) {
	comment.replies = comment.replies.rows
	return comment
}

function ensureAreaCode(number) {
	// Numbers without a leading "+" but with a suitable area code, like
	// 37200000766, seem to work.
	if (/^\+/.exec(number)) return number
	if (/^37[012]/.exec(number)) return number
	return "+372" + number
}

function parseCitizenEvent(obj) {
	// Parse dates from the title until CitizenOS supports setting the creation
	// date when necessary.
	var subject = parsePrefixDate(obj.subject)

	return {
		subject: subject[0],
		text: obj.text,
		createdAt: subject[1] || new Date(obj.createdAt)
	}
}

function parsePrefixDate(str) {
	var m, date = (
		(m = ISO8601_DATE.exec(str)) ? new Date(m[1], m[2] - 1, m[3]) :
		(m = LOCAL_DATE.exec(str)) ? new Date(m[3], m[2] - 1, m[1]) :
		null
	)
		
	return [m ? str.slice(m[0].length) : str, date]
}

function isMailchimpNameTakenErr(err) {
	return err.code == 400 && /already exists/.test(err.response.body.detail)
}

function isMailchimpEmailErr(err) {
	return err.code == 400 && (
		err.response.body.errors &&
		err.response.body.errors.some((e) => e.field == "email_address") ||
		/email address/.test(err.response.body.detail)
	)
}

function* readOrCreateDbInitiative(uuid) {
	var obj = yield db.read("SELECT * FROM initiatives WHERE uuid = ?", [uuid])
	if (obj) return obj

	obj = {uuid: uuid}
	yield db.create("initiatives", obj)
	return obj
}

function getBody(res) { return res.body.data }

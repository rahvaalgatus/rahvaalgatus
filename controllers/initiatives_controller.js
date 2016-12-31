"use strict"
var O = require("oolong")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var Initiative = require("root/lib/initiative")
var DateFns = require("date-fns")
var Config = require("root/config")
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var isFetchError = require("root/lib/fetch").is
var next = require("co-next")
var sleep = require("root/lib/promise").sleep
var api = require("root/lib/citizen_os")
var translateCitizenError = require("root/lib/citizen_os").translateError
var redirect = require("root/lib/redirect")
var co = require("co")
var EMPTY_INITIATIVE = {title: "", contact: {name: "", email: "", phone: ""}}
var EMPTY_COMMENT = {subject: "", text: ""}

var UI_TRANSLATIONS = O.map(require("root/lib/i18n").LANGUAGES, function(lang) {
	return O.filter(lang, (v, k) => k.indexOf("HWCRYPTO") >= 0)
})

exports.router = Router({mergeParams: true})

exports.router.get("/", redirect(302, "/"))

exports.router.post("/", next(function*(req, res) {
	var attrs = O.assign({}, EMPTY_INITIATIVE, {
		title: req.body.title,
		visibility: "private",

		// NOTE: CitizenOS or Etherpad saves all given whitespace as
		// non-breaking-spaces, so make sure to not have any around <body> or other
		// tags.
		description: req.t("INITIATIVE_DEFAULT_HTML", {title: req.body.title}),
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
		res.redirect(303, req.baseUrl + "/" + initiative.id)
	}
	else res.status(422).render("initiatives/create", {
		error: translateCitizenError(req.t, created.body),
		attrs: attrs
	})
}))

exports.router.get("/new", function(req, res) {
	res.render("initiatives/create", {attrs: EMPTY_INITIATIVE})
})

exports.router.use("/:id", next(function*(req, res, next) {
	var path = `/api/topics/${req.params.id}?include[]=vote`
	if (req.user) path = "/api/users/self" + path.slice(4)
	try { req.initiative = yield req.api(path).then(getBody) }
	catch (ex) { if (isFetchError(404, ex)) throw new HttpError(404); throw ex }
	res.locals.initiative = req.initiative
	next()
}))

exports.router.get("/:id", function(req, res, next) {
	var initiative = req.initiative
	switch (initiative.status) {
		case "inProgress": req.url = req.path + "/discussion"; break
		case "voting": req.url = req.path + "/vote"; break
		case "followUp": req.url = req.path + "/events"; break
		default: return void next(new HttpError(403, "Unknown Status"))
	}

	next()
})

exports.router.put("/:id", next(function*(req, res) {
	var initiative = req.initiative
	res.locals.subpage = initiative.status == "inProgress" ? "discussion" : "vote"

	var tmpl
	var method = "PUT"
	var path = `/api/users/self/topics/${initiative.id}`
	var attrs = EMPTY_INITIATIVE

	if (req.body.visibility === "public") {
		tmpl = "initiatives/update_for_publish"
		if (!Initiative.isPublishable(initiative)) throw new HttpError(401)
		if (req.body.endsAt == null) return void res.render(tmpl, {attrs: attrs})

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
		if (!Initiative.isProposable(new Date, initiative)) throw new HttpError(401)
		if (req.body.endsAt == null) return void res.render(tmpl, {attrs: attrs})

		let endsAt = DateFns.endOfDay(new Date(req.body.endsAt))
		if (!Initiative.isDeadlineOk(new Date, endsAt))
			return void res.render(tmpl, {
				error: req.t("DEADLINE_ERR", {days: Config.minDeadlineDays}),
				attrs: {endsAt: endsAt}
			})

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
	else if (req.body.status === "followUp") {
		tmpl = "initiatives/update_for_parliament"
		if (!Initiative.isParliamentable(initiative)) throw new HttpError(401)
		if (req.body.contact == null) return void res.render(tmpl, {attrs: attrs})

		attrs = {
			status: req.body.status,
			contact: O.defaults(req.body.contact, EMPTY_INITIATIVE.contact)
		}
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

		res.redirect(303, req.baseUrl + "/" + initiative.id)
	}
	else res.status(422).render(tmpl, {
		error: translateCitizenError(req.t, updated.body),
		attrs: attrs
	})
}))

exports.read = co.wrap(function*(subpage, req, res) {
	var initiative = req.initiative

	var path = `/api/topics/${initiative.id}/comments?orderBy=date`
	if (req.user) path = "/api/users/self" + path.slice(4)
	var comments = yield req.api(path)
	comments = comments.body.data.rows.map(normalizeComment).reverse()

	res.render("initiatives/read", {
		subpage: subpage,
		comments: comments,
		comment: res.locals.comment || EMPTY_COMMENT,
		text: normalizeText(initiative.description),
		translations: UI_TRANSLATIONS[req.lang]
	})
})

exports.router.get("/:id/discussion", exports.read.bind(null, "discussion"))
exports.router.get("/:id/vote", exports.read.bind(null, "vote"))

exports.router.use("/:id/comments",
	require("./initiatives/comments_controller").router)
exports.router.use("/:id/events",
	require("./initiatives/events_controller").router)

exports.router.get("/:id/signable", next(function*(req, res) {
	var initiative = req.initiative
	var vote = initiative.vote

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
					phoneNumber: req.body.phoneNumber,
				}
			}).catch(catch400)

			if (isOk(signing)) {
				res.render("initiatives/signature/create", {
					code: signing.body.data.challengeID,
					poll: req.baseUrl + req.path + "?token=" + signing.body.data.token
				})
			}
			else res.status(422).render("initiatives/signature/create", {
				error: translateCitizenError(req.t, signed.body)
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
			res.flash("signed", signature.body.data.bdocUri)
			break

		default:
			res.flash("error", translateCitizenError(req.t, signature.body))
			break
	}

	res.redirect(303, req.baseUrl + "/" + initiative.id)
}))

exports.router.use(function(err, req, res, next) {
  if (!(err instanceof HttpError)) return void next(err)
  if (err.code !== 404) return void next(err)
	res.render("initiatives/404", {error: err})
})

function* readSignature(initiative, token) {
	var vote = initiative.vote
	var path = `/api/topics/${initiative.id}/votes/${vote.id}/status`
	path += "?token=" + encodeURIComponent(token)

	RETRY: for (var i = 0; i < 60; ++i) {
		var res = yield api(path).catch(catch400)

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

function normalizeText(html) {
	return html.match(/<body>(.*)<\/body>/)[1]
}

function normalizeComment(comment) {
	comment.replies = comment.replies.rows
	return comment
}
function getBody(res) { return res.body.data }

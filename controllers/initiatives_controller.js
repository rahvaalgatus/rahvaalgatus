var Router = require("express").Router
var AppController = require("root/controllers/app_controller")
var FetchError = require("fetch-error")
var HttpError = require("standard-http-error")
var next = require("co-next")
var api = require("root/lib/citizen_os")
var sleep = require("root/lib/promise").sleep
var readInitiative = api.readInitiative
var redirect = require("root/lib/middleware/redirect_middleware")

exports.router = Router({mergeParams: true})

exports.router.get("/", redirect(302, "/"))
exports.router.get("/new", AppController.read)
exports.router.get("/:id/deadline", AppController.read)

exports.router.use("/:id", next(function*(req, res, next) {
	req.initiative = yield readInitiative(req.params.id)
	res.locals.page = "initiative"
	res.locals.initiative = req.initiative
	next()
}))

exports.router.get("/:id", function(req, res, next) {
	if (req.user) return void next()

	var initiative = req.initiative
	switch (initiative.status) {
		case "inProgress": req.url = req.path + "/discussion"; break
		case "voting": req.url = req.path + "/vote"; break
		case "followUp": req.url = req.path + "/events"; break
	}

	next()
})

exports.router.get("/:id/discussion", next(read.bind(null, "discussion")))
exports.router.get("/:id/vote", next(read.bind(null, "vote")))

exports.router.get("/:id/events", next(function*(req, res) {
	var initiative = req.initiative
	var events = yield api(`/api/topics/${initiative.id}/events`)
	events = events.body.data.rows

	res.render("initiatives/events", {
		title: initiative.title,
		subpage: "events",
		events: events,
	})
}))

exports.router.post("/:id/signature", next(function*(req, res) {
	var initiative = req.initiative
	var vote = initiative.vote

	var sign = yield api(`/api/topics/${initiative.id}/votes/${vote.id}`, {
		method: "POST",

		json: {
			options: [{optionId: req.body.optionId}],
			pid: req.body.pid,
			phoneNumber: req.body.phoneNumber
		}
	}).catch(catchMobileIdError)

	if (sign.statusCode >= 200 && sign.statusCode < 300) {
		res.locals.code = sign.body.data.challengeID
		res.locals.poll = req.baseUrl + req.path + "?token=" + sign.body.data.token
	}
	else {
		res.status(422)
		res.locals.error = translateMobileIdError(req.t, sign.body.status)
	}

	res.render("initiatives/signature/create", {
		title: initiative.title,
		subpage: "vote"
	})
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
			res.flash("error", translateMobileIdError(req.t, signature.body.status))
			break
	}

	res.redirect(303, req.baseUrl + "/" + initiative.id)
}))

function* read(subpage, req, res, next) {
	if (req.user) return void next()

	var initiative = req.initiative
	var comments = yield api(`/api/topics/${initiative.id}/comments?orderBy=date`)
	comments = comments.body.data.rows.map(normalizeComment)

	res.render("initiatives/read", {
		title: initiative.title,
		subpage: subpage,
		comments: comments,
		text: normalizeText(initiative.description)
	})
}

function* readSignature(initiative, token) {
	var vote = initiative.vote
	var path = `/api/topics/${initiative.id}/votes/${vote.id}/status`
	path += "?token=" + encodeURIComponent(token)

	RETRY: for (var i = 0; i < 60; ++i) {
		var res = yield api(path).catch(catchMobileIdError)

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

function catchMobileIdError(err) {
	if (err instanceof FetchError && err.code === 400) return err.response
	else throw err
}

function normalizeText(html) {
	return html.match(/<body>(.*)<\/body>/)[1]
}

function normalizeComment(comment) {
	comment.replies = comment.replies.rows
	return comment
}

function translateMobileIdError(t, status) {
	return t(keyifyError(status.code)) || status.message
}

function keyifyError(citizenCode) { return `MSG_ERROR_${citizenCode}_VOTE` }

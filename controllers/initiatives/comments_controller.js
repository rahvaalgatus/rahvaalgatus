var Path = require("path")
var Router = require("express").Router
var InitiativesController = require("../initiatives_controller")
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var translateCitizenError = require("root/lib/citizen_os").translateError
var next = require("co-next")
var format = require("util").format
var commentsPath = format.bind(null, "/api/users/self/topics/%s/comments")

exports.router = Router({mergeParams: true})

exports.router.post("/", next(function*(req, res, next) {
	var initiative = req.initiative

	var created = yield req.api(commentsPath(initiative.id), {
		method: "POST",
		json: {
			parentId: null,
			type: "pro",
			subject: req.body.subject,
			text: req.body.text
		}
	}).catch(catch400)

	if (isOk(created))
		res.redirect(303, Path.dirname(req.baseUrl) + "#initiative-comments")
	else {
		res.locals.comment = req.body
		renderWithError(initiative, created.body, req, res, next)
	}
}))

exports.router.post("/:commentId/replies", next(function*(req, res, next) {
	var initiative = req.initiative
	var commentId = req.params.commentId

	var created = yield req.api(commentsPath(initiative.id), {
		method: "POST",
		json: {
			parentId: commentId,
			type: "reply",
			text: req.body.text
		}
	}).catch(catch400)

	if (isOk(created))
		res.redirect(303, Path.dirname(req.baseUrl) + "#initiative-comments")
	else {
		res.locals.comment = {__proto__: req.body, parentId: commentId}
		renderWithError(initiative, created.body, req, res, next)
	}
}))

function renderWithError(initiative, err, req, res, next) {
	var subpage = initiative.status === "inProgress" ? "discussion" : "vote"
	var msg = translateCitizenError(req.t, err)
	res.flash("error", msg)
	res.flash("commentError", msg)
	res.status(422)
	InitiativesController.read(subpage, req, res, next)
}

var Path = require("path")
var Router = require("express").Router
var InitiativesController = require("../initiatives_controller")
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var translateCitizenError = require("root/lib/citizen_os").translateError
var next = require("co-next")

exports.router = Router({mergeParams: true})

exports.router.post("/", next(function*(req, res, next) {
	var initiative = req.initiative
	var path = `/api/users/self/topics/${initiative.id}/comments`

	var created = yield req.api(path, {
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
		var subpage = initiative.status === "inProgress" ? "discussion" : "vote"
		res.locals.comment = req.body
		res.flash("error", translateCitizenError(req.t, created.body))
		res.status(422)
		InitiativesController.read(subpage, req, res, next)
	}
}))

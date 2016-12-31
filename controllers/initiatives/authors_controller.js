var Path = require("path")
var Router = require("express").Router
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var translateCitizenError = require("root/lib/citizen_os").translateError
var next = require("co-next")
var EMPTY_AUTHOR = {email: ""}

exports.router = Router({mergeParams: true})

exports.router.get("/new", function(req, res) {
	res.render("initiatives/authors/create", {attrs: EMPTY_AUTHOR})
})

exports.router.post("/", next(function*(req, res, next) {
	var initiative = req.initiative

	var path = `/api/users/self/topics/${initiative.id}/members/users`
	var created = yield req.api(path, {
		method: "POST",
		json: {userId: req.body.email, name: req.body.email, level: "edit"}
	}).catch(catch400)

	if (isOk(created)) {
		res.flash("notice", "Kaasautor lisatud.")
		res.redirect(303, Path.dirname(req.baseUrl))
	}
	else res.status(422).render("initiatives/authors/create", {
		error: translateCitizenError(req.t, created.body),
		attrs: req.body
	})
}))

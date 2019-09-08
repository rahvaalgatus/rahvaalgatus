var Path = require("path")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var Topic = require("root/lib/topic")
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var translateCitizenError = require("root/lib/citizenos_api").translateError
var next = require("co-next")
var EMPTY_AUTHOR = {email: ""}

exports.router = Router({mergeParams: true})

exports.router.use(function(req, _res, next) {
	if (req.user == null) throw new HttpError(401)

	var topic = req.topic
	if (topic == null) throw new HttpError(403)

	if (!Topic.can("admin", req.topic))
		throw new HttpError(403, "No Edit Permission")

	next()
})

exports.router.get("/new", function(_req, res) {
	res.render("initiatives/authors/create_page.jsx", {attrs: EMPTY_AUTHOR})
})

exports.router.post("/", next(function*(req, res) {
	var topic = req.topic

	var path = `/api/users/self/topics/${topic.id}/members/users`
	var created = yield req.cosApi(path, {
		method: "POST",
		json: {userId: req.body.email, level: "edit"}
	}).catch(catch400)

	if (isOk(created)) {
		res.flash("notice", "Kaasautor lisatud.")
		res.redirect(303, Path.dirname(req.baseUrl))
	}
	else res.status(422).render("initiatives/authors/create_page.jsx", {
		error: translateCitizenError(req.t, created.body),
		attrs: req.body
	})
}))

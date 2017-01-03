var O = require("oolong")
var Router = require("express").Router
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var translateCitizenError = require("root/lib/citizen_os").translateError
var next = require("co-next")

exports.router = Router({mergeParams: true})

exports.read = next(function*(req, res) {
	var initiatives = req.api("/api/users/self/topics?include[]=vote")
	initiatives = yield initiatives.then(getRows)

	res.render("user/read", {
		user: req.user,
		initiatives: initiatives,
		attrs: O.create(req.user, res.locals.attrs)
	})
})

exports.router.get("/", exports.read)

exports.router.put("/", next(function*(req, res, next) {
	var updated = yield req.api("/api/users/self", {
		method: "PUT",
		json: {name: req.body.name, email: req.body.email}
	}).catch(catch400)

	if (isOk(updated)) {
		res.flash("notice", "Muudatused salvestatud.")
		res.redirect(303, req.baseUrl)
	}
	else {
		res.status(422)
		res.locals.error = translateCitizenError(req.t, updated.body)
		res.locals.attrs = req.body
		exports.read(req, res, next)
	}
}))

function getRows(res) { return res.body.data.rows }

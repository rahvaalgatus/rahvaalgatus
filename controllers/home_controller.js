var Router = require("express").Router
var api = require("root/lib/citizen_os")
var next = require("co-next")

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res, next) {
	res.render("home/index", yield api.readInitiatives())
}))

exports.router.get("/about", (req, res) => res.render("home/about"))
exports.router.get("/donate", (req, res) => res.render("home/donate"))

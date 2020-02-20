var Router = require("express").Router

exports.router = Router({mergeParams: true})

exports.router.get("/", function(_req, res) {
	res.render("demo_signatures/index_page.jsx")
})

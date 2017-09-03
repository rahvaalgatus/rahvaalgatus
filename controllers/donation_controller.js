var Router = require("express").Router

exports.router = Router({mergeParams: true})

exports.router.get("/new", function(req, res) {
	var transaction = "json" in req.query ? parseJson(req.query.json) : null

	res.render("donation/create", {
		amount: transaction && Number(transaction.amount),
		reference: transaction && transaction.reference
	})
})

exports.router.get("/", (_req, res) => res.render("donation/created"))

function parseJson(json) {
	try { return JSON.parse(json) } catch (ex) { return null }
}

var Config = require("root/config")
var Router = require("express").Router
var encode = encodeURIComponent

exports.router = Router({mergeParams: true})

exports.router.get("/new", function(req, res) {
	var transaction = "json" in req.query ? parseJson(req.query.json) : null

	res.render("donation/create", {
		amount: transaction && Number(transaction.amount),
		reference: transaction && transaction.reference
	})
})

exports.router.post("/", function(req, res) {
	var id = "default=" + Number(req.body.default)
	var url = Config.maksekeskusUrl
	url += "?shopId=" + encode(Config.maksekeskusId)
	url += "&amount=" + Number(req.body.amount)
	url += "&paymentId=" + encode(id)
	res.redirect(url)
})

exports.router.get("/", (_req, res) => res.render("donation/created"))

function parseJson(json) {
	try { return JSON.parse(json) } catch (ex) { return null }
}

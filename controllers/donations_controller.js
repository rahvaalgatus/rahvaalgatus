var _ = require("root/lib/underscore")
var Config = require("root/config")
var Router = require("express").Router
var encode = encodeURIComponent
var canonicalizeUrl = require("root/lib/middleware/canonical_site_middleware")

exports.router = Router({mergeParams: true})

exports.router.get("/new", canonicalizeUrl, function(req, res) {
	var transaction = "json" in req.query ? parseJson(req.query.json) : null

	res.render("donations/create_page.jsx", {
		amount: transaction && Number(transaction.amount)
	})
})

// NOTE: Don't canonicalize POST /donations as the donation form also sits on
// local sites.
exports.router.post("/", function(req, res) {
	var person = (req.body.person || "").trim()
	var def = Number(req.body.default)

	var url = Config.maksekeskusUrl
	url += "?shopId=" + encode(Config.maksekeskusId)
	url += "&donate=true"
	url += "&amount=" + Number(req.body.amount)

	var id = {default: def, person: person}
	if (req.body.for) id.for = req.body.for
	id = _.map(id, (v, k) => `${k}=${encode(v)}`).join(" ")
	url += "&paymentId=" + encode(id)
	res.redirect(url)
})

exports.router.get("/created", canonicalizeUrl, (_req, res) => (
	res.render("donations/created_page.jsx")
))

function parseJson(json) {
	try { return JSON.parse(json) } catch (ex) { return null }
}

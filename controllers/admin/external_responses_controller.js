var {Router} = require("express")
var responsesDb = require("root/db/external_responses_db")
var sql = require("sqlate")

exports.router = Router({mergeParams: true})

exports.router.get("/", function(_req, res) {
	var responses = responsesDb.search(sql`
		SELECT * FROM external_responses
		ORDER BY requested_at DESC
	`)

	res.render("admin/external_responses/index_page.jsx", {responses})
})

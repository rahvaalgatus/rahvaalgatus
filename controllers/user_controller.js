var Router = require("express").Router
var next = require("co-next")

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res) {
	var initiatives = req.api("/api/users/self/topics?include[]=vote")
	initiatives = yield initiatives.then(getRows)

	res.render("user/read", {
		user: req.user,
		initiatives: initiatives
	})
}))

function getRows(res) { return res.body.data.rows }

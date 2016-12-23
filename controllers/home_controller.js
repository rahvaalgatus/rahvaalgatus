var Router = require("express").Router
var Config = require("root/config")
var api = require("root/lib/citizen_os")
var next = require("co-next")

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res, next) {
	var initiatives = yield {
		discussions: read("inProgress"),
		votings: read("voting"),
		processes: read("followUp")
	}

	res.render("home/index", {
		page: "home",
		discussions: initiatives.discussions,
		votings: initiatives.votings,
		processes: initiatives.processes
	})
}))

exports.router.get("/about", (req, res) => res.render("home/about"))
exports.router.get("/donate", (req, res) => res.render("home/donate"))

// If not requesting per-status, limit applies to the entire returned set.
// Saving us from pagination for now.
function read(status) {
	var path = "/api/topics"
	path += `?sourcePartnerId=${Config.apiPartnerId}`
	path += "&include[]=vote"
	path += "&limit=100"
	path += `&statuses=${status}`
	return api(path).then((res) => res.body.data.rows)
}

var O = require("oolong")
var Router = require("express").Router
var api = require("root/lib/citizen_os")
var next = require("co-next")

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res, next) {
	var initiatives = yield {
		discussions: readInitiatives("inProgress"),
		votings: readInitiatives("voting"),
		processes: readInitiatives("followUp"),
	}
		
	initiatives = O.map(initiatives, (res) => res.body.data.rows)
	var discussions = initiatives.discussions
	var votings = yield readInitiativesWithVotes(initiatives.votings)
	var processes = yield readInitiativesWithVotes(initiatives.processes)

	res.render("home/index", {
		page: "home",
		discussions: discussions,
		votings: votings,
		processes: processes
	})
}))
	
function readInitiatives(status) {
	return api(`/api/topics?statuses=${status}`)
}

function readInitiativesWithVotes(initiatives) {
	return initiatives.map(function(initiative) {
		return api(`/api/topics/${initiative.id}`).then(function(res) {
			var initiative = res.body.data, voteId = initiative.vote.id
			var vote = api(`/api/topics/${initiative.id}/votes/${voteId}`)
			return vote.then((res) => ({__proto__: initiative, vote: res.body.data}))
		})
	})
}

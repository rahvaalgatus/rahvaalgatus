var Router = require("express").Router
var Path = require("path")
var next = require("co-next")
var api = require("root/lib/citizen_os")
var readInitiative = api.readInitiative
var redirect = require("root/lib/middleware/redirect_middleware")

exports.router = Router({mergeParams: true})

exports.router.get("/", redirect(302, "/"))

exports.router.use("/:id", next(function*(req, res, next) {
	req.initiative = yield readInitiative(req.params.id)
	next()
}))

exports.router.get("/:id", function(req, res, next) {
	if (req.user) return void next()

	var initiative = req.initiative
	switch (initiative.status) {
		case "inProgress": req.url = req.path + "/discussion"; break
		case "voting": req.url = req.path + "/vote"; break
		case "followUp": req.url = req.path + "/events"; break
	}

	next()
})

exports.router.get("/:id/discussion", next(read))
exports.router.get("/:id/vote", next(read))

exports.router.get("/:id/events", next(function*(req, res, next) {
	var initiative = req.initiative
	var events = yield api(`/api/topics/${initiative.id}/events`)
	events = events.body.data.rows

	res.render("initiatives/events", {
		title: initiative.title,
		page: "initiative",
		subpage: "events",

		initiative: initiative,
		events: events,
	})
}))

function* read(req, res, next) {
	if (req.user) return void next()

	var initiative = req.initiative
	var comments = yield api(`/api/topics/${initiative.id}/comments?orderBy=date`)
	comments = comments.body.data.rows.map(normalizeComment)

	res.render("initiatives/read", {
		title: initiative.title,
		page: "initiative",
		subpage: Path.basename(req.path),

		initiative: initiative,
		comments: comments,
		text: normalizeText(initiative.description)
	})
}

function normalizeText(html) {
	return html.match(/<body>(.*)<\/body>/)[1]
}

function normalizeComment(comment) {
	comment.replies = comment.replies.rows
	return comment
}

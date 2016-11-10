var Router = require("express").Router
var next = require("co-next")
var api = require("root/lib/citizen_os")
var redirect = require("root/lib/middleware/redirect_middleware")

exports.router = Router({mergeParams: true})

exports.router.get("/", redirect(302, "/"))

exports.router.get("/:id", next(function*(req, res, next) {
	// Only render for anonymous users for now.
	if (req.user) return void next()

	var id = req.params.id
	var initiative = yield api(`/api/topics/${id}`)
	initiative = initiative.body.data

	var comments = yield api(`/api/topics/${id}/comments?orderBy=date`)
	comments = comments.body.data.rows.map(normalizeComment)

	res.render("initiatives/read", {
		page: "initiative",
		initiative: initiative,
		comments: comments,
		text: normalizeText(initiative.description)
	})
}))

function normalizeText(html) {
	return html.match(/<body>(.*)<\/body>/)[1]
}

function normalizeComment(comment) {
	comment.replies = comment.replies.rows
	return comment
}

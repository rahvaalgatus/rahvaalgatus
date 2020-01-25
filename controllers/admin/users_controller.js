var _ = require("root/lib/underscore")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var commentsDb = require("root/db/comments_db")
var cosDb = require("root").cosDb
var next = require("co-next")
var sql = require("sqlate")

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(_req, res) {
	var users = yield usersDb.search(sql`
		SELECT * FROM users
		ORDER BY created_at DESC
	`)

	res.render("admin/users/index_page.jsx", {users: users})
}))

exports.router.use("/:id", next(function*(req, _res, next) {
	var user = yield usersDb.read(sql`
		SELECT * FROM users WHERE id = ${req.params.id}
	`)

	if (user == null) throw new HttpError(404)

	req.editableUser = user
	next()
}))

exports.router.get("/:id", next(function*(req, res) {
	var user = req.editableUser

	var initiatives = yield initiativesDb.search(sql`
		SELECT * FROM initiatives WHERE user_id = ${user.id}
	`)

	var topics = _.indexBy(yield cosDb.query(sql`
		SELECT *
		FROM "Topics"
		WHERE id IN ${sql.in(initiatives.map((i) => i.uuid))}
	`), "id")

	initiatives.forEach(function(initiative) {
		if (initiative.external) return

		var topic = topics[initiative.uuid]
		initiative.title = topic.title
		initiative.published_at = topic.visibility == "public" ? new Date(0) : null
	})

	var comments = yield commentsDb.search(sql`
		SELECT * FROM comments WHERE user_id = ${user.id}
	`)

	res.render("admin/users/read_page.jsx", {
		user: user,
		initiatives: initiatives,
		comments: comments
	})
}))

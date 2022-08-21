var _ = require("root/lib/underscore")
var {Router} = require("express")
var HttpError = require("standard-http-error")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var commentsDb = require("root/db/comments_db")
var sql = require("sqlate")
var {sqlite} = require("root")

exports.router = Router({mergeParams: true})

exports.router.get("/", function(_req, res) {
	var users = usersDb.search(sql`
		SELECT * FROM users
		ORDER BY created_at DESC
	`)

	res.render("admin/users/index_page.jsx", {users: users})
})

exports.router.use("/:id", function(req, _res, next) {
	var user = usersDb.read(sql`
		SELECT user.*, merged_with.name AS merged_with_name
		FROM users AS user
		LEFT JOIN users AS merged_with ON merged_with.id = user.merged_with_id
		WHERE user.id = ${req.params.id}
	`)

	if (user == null) throw new HttpError(404)

	req.editableUser = user
	next()
})

exports.router.get("/:id", function(req, res) {
	var user = req.editableUser

	var initiatives = initiativesDb.search(sql`
		SELECT * FROM initiatives WHERE user_id = ${user.id}
	`)

	var comments = commentsDb.search(sql`
		SELECT * FROM comments WHERE user_id = ${user.id}
	`)

	res.render("admin/users/read_page.jsx", {
		user: user,
		initiatives: initiatives,
		comments: comments
	})
})

exports.router.put("/:id", function(req, res) {
	if (req.body.mergedWithPersonalId) {
		var source = req.editableUser

		var target = usersDb.read(sql`
			SELECT * FROM users
			WHERE country = 'EE'
			AND personal_id = ${req.body.mergedWithPersonalId}
		`)

		if (target == null)
			throw new HttpError(409, "No User With Given Personal id")

		mergeUser(source, target)

		res.flash("notice", `Merged with ${target.name} (id ${target.id})`)
		res.redirect(303, req.baseUrl + "/" + source.id)
	}
	else throw new HttpError(422, "Invalid Attribute")
})

function mergeUser(source, target) {
	sqlite(sql`
		UPDATE initiatives SET user_id = ${target.id}
		WHERE user_id = ${source.id}
	`)

	sqlite(sql`
		UPDATE comments SET
			user_id = ${target.id},
			user_uuid = ${_.serializeUuid(target.uuid)}
		WHERE user_id = ${source.id}
	`)

	sqlite(sql`
		UPDATE initiative_events SET
			user_id = ${target.id},
			created_by = ${_.serializeUuid(target.uuid)}
		WHERE user_id = ${source.id}
	`)

	usersDb.update(source, {merged_with_id: target.id})
}

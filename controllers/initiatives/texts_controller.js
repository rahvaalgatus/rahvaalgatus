var Router = require("express").Router
var HttpError = require("standard-http-error")
var textsDb = require("root/db/initiative_texts_db")
var next = require("co-next")
var sql = require("sqlate")

exports.router = Router({mergeParams: true})

exports.router.use(function(req, _res, next) {
	var user = req.user
	if (user == null) throw new HttpError(401)

	var initiative = req.initiative
	if (user && initiative.user_id == user.id) next()
	else throw new HttpError(403, "No Permission to Edit")
})

exports.router.post("/", next(function*(req, res) {
	var user = req.user
	var initiative = req.initiative

	if (initiative.phase != "edit")
		throw new HttpError(405, "Can Only Edit Discussions")

	var attrs = parse(req.body)

	// Matching basis are also enforced by the database schema, but let's not
	// throw an SQL error should something happen to the basis.
	if (attrs.basis_id && !(yield textsDb.read(sql`
		SELECT true FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND id = ${attrs.basis_id}
	`))) attrs.basis_id = null

	yield textsDb.create({
		__proto__: attrs,
		initiative_uuid: initiative.uuid,
		user_id: user.id,
		created_at: new Date
	})

	res.flash("notice", initiative.published_at
		? req.t("INITIATIVE_TEXT_CREATED_IF_PUBLISHED")
		: req.t("INITIATIVE_TEXT_CREATED")
	)

	res.redirect("/initiatives/" + initiative.uuid)
}))

function parse(obj) {
	return {
		content: JSON.parse(obj.content),
		content_type: "application/vnd.basecamp.trix+json",
		basis_id: Number(obj["basis-id"]) || null
	}
}

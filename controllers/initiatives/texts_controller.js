var _ = require("root/lib/underscore")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var Initiative = require("root/lib/initiative")
var initiativesDb = require("root/db/initiatives_db")
var textsDb = require("root/db/initiative_texts_db")
var next = require("co-next")
var sql = require("sqlate")
var parseBody = require("body-parser").raw
var {hasSignatureType} = require("./signatures_controller")
var LANGUAGES = require("root/config").languages
exports.parse = parse

exports.router = Router({mergeParams: true})
exports.router.use(parseBody({type: hasSignatureType}))

exports.router.use(function(req, _res, next) {
	var user = req.user
	if (user == null) throw new HttpError(401)

	var initiative = req.initiative
	var isAuthor = user && Initiative.isAuthor(user, initiative)

	if (!isAuthor) throw new HttpError(403, "No Permission to Edit")

	if (!(initiative.phase == "edit" || initiative.phase == "sign"))
		throw new HttpError(403, "Not Editable")

	next()
})

exports.router.get("/new", next(function*(req, res) {
	var initiative = req.initiative
	var lang = req.query.language || "et"

	var text = yield textsDb.read(sql`
		SELECT * FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND language = ${lang}
		ORDER BY created_at DESC
		LIMIT 1
	`)

	if (text) res.redirect(req.baseUrl + "/" + text.id)
	else res.render("initiatives/update_page.jsx", {language: lang})
}))

exports.router.use("/:id", next(function*(req, _res, next) {
	var initiative = req.initiative

	var text = yield textsDb.read(sql`
		SELECT * FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND id = ${req.params.id}
	`)

	if (text == null) throw new HttpError(404)

	req.text = text
	next()
}))

exports.router.get("/:id", function(req, res) {
	res.render("initiatives/update_page.jsx", {text: req.text})
})

exports.router.post("/", next(function*(req, res) {
	var user = req.user
	var initiative = req.initiative
	var attrs = parse(req.body)

	if (!(
		initiative.phase == "edit" ||
		initiative.phase == "sign" && initiative.language != attrs.language
	)) throw new HttpError(405, "Can Only Add Translations")

	// Matching basis are also enforced by the database schema, but let's not
	// throw an SQL error should something happen to the basis.
	if (attrs.basis_id && !(yield textsDb.read(sql`
		SELECT true FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND id = ${attrs.basis_id}
	`))) attrs.basis_id = null

	var text = yield textsDb.create({
		__proto__: attrs,
		initiative_uuid: initiative.uuid,
		user_id: user.id,
		created_at: new Date
	})

	if (
		initiative.phase == "edit" && (
			initiative.language == text.language ||
			_.parseBoolean(req.body["set-default"])
		)
	) initiative = yield initiativesDb.update(initiative, {
		title: text.title,
		language: text.language
	})

	res.flash("notice",
		initiative.published_at && initiative.language == text.language
		? req.t("INITIATIVE_TEXT_CREATED_IF_PUBLISHED")
		: req.t("INITIATIVE_TEXT_CREATED")
	)

	var path = "/initiatives/" + initiative.uuid
	if (text.language != initiative.language) path += "?language=" + text.language
	res.redirect(path)
}))

function parse(obj) {
	return {
		title: String(obj.title),
		content: obj.content ? JSON.parse(obj.content) : [],
		content_type: "application/vnd.basecamp.trix+json",
		language: LANGUAGES.includes(obj.language) ? obj.language : "et",
		basis_id: Number(obj["basis-id"]) || null
	}
}

var _ = require("root/lib/underscore")
var {Router} = require("express")
var Config = require("root").config
var HttpError = require("standard-http-error")
var Initiative = require("root/lib/initiative")
var initiativesDb = require("root/db/initiatives_db")
var textsDb = require("root/db/initiative_texts_db")
var sql = require("sqlate")
var TRIX_CONTENT_TYPE = "application/vnd.basecamp.trix+json"
exports.parse = parse

exports.router = Router({mergeParams: true})

exports.router.use(function(req, _res, next) {
	var {user} = req
	if (user == null) throw new HttpError(401)

	var {initiative} = req
	var isAuthor = user && Initiative.isAuthor(user, initiative)

	if (!isAuthor) throw new HttpError(403, "No Permission to Edit")

	if (!(initiative.phase == "edit" || initiative.phase == "sign"))
		throw new HttpError(403, "Not Editable")

	next()
})

exports.router.get("/new", function(req, res) {
	var {initiative} = req
	var lang = req.query.language || "et"

	var text = textsDb.read(sql`
		SELECT * FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND language = ${lang}
		ORDER BY created_at DESC
		LIMIT 1
	`)

	if (text) res.redirect(req.baseUrl + "/" + text.id)
	else res.render("initiatives/update_page.jsx", {language: lang})
})

exports.router.use("/:id", function(req, _res, next) {
	var {initiative} = req

	var text = textsDb.read(sql`
		SELECT * FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND id = ${req.params.id}
	`)

	if (text == null) throw new HttpError(404)

	req.text = text
	next()
})

exports.router.get("/:id", function(req, res) {
	res.render("initiatives/update_page.jsx", {text: req.text})
})

exports.router.post("/", function(req, res) {
	var {user} = req
	var {initiative} = req
	var attrs = parse(req.body)

	if (!(
		initiative.phase == "edit" ||
		initiative.phase == "sign" && initiative.language != attrs.language
	)) throw new HttpError(405, "Can Only Add Translations")

	// Matching basis are also enforced by the database schema, but let's not
	// throw an SQL error should something happen to the basis.
	if (attrs.basis_id && textsDb.read(sql`
		SELECT true FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND id = ${attrs.basis_id}
	`) == null) attrs.basis_id = null

	var text = textsDb.create({
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
	) initiative = initiativesDb.update(initiative, {
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

	res.statusMessage = "Text Created"
	res.redirect(303, path)
})

var validate = require("root/lib/json_schema").new({
	type: "object",
	additionalProperties: false,
	required: ["title", "content", "language"],

	properties: {
		title: {type: "string", maxLength: 200},
		content: {type: "array"},
		content_type: {const: TRIX_CONTENT_TYPE},
		language: {enum: Config.languages},
		basis_id: {type: ["number", "null"]}
	}
})

function parse(obj) {
	var err, attrs = {
		title: obj.title,
		content: obj.content ? JSON.parse(obj.content) : [],
		content_type: TRIX_CONTENT_TYPE,
		language: obj.language || Config.language,
		basis_id: Number(obj["basis-id"]) || null
	}

	if (err = validate(attrs)) throw new HttpError(422, "Invalid Attributes", {
		attributes: err
	})

	return attrs
}

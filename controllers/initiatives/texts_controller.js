var _ = require("root/lib/underscore")
var {Router} = require("express")
var Config = require("root").config
var HttpError = require("standard-http-error")
var Initiative = require("root/lib/initiative")
var Trix = require("root/lib/trix")
var initiativesDb = require("root/db/initiatives_db")
var textsDb = require("root/db/initiative_texts_db")
var sql = require("sqlate")
var TRIX_CONTENT_TYPE = "application/vnd.basecamp.trix+json"
var TRIX_SECTIONS_TYPE = "application/vnd.rahvaalgatus.trix-sections+json"
var SUMMARY_MAX_LENGTH = 280
exports.parse = parse
exports.SUMMARY_MAX_LENGTH = SUMMARY_MAX_LENGTH

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
	var lang = req.query.language || initiative.language

	var text = textsDb.read(sql`
		SELECT * FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND language = ${lang}
		ORDER BY created_at DESC
		LIMIT 1
	`)

	if (text) return void res.redirect(req.baseUrl + "/" + text.id)

	var primaryText = textsDb.read(sql`
		SELECT content_type FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND language = ${initiative.language}
		ORDER BY id DESC
		LIMIT 1
	`)

	res.render("initiatives/update_page.jsx", {
		language: lang,

		sections: (
			primaryText == null ||
			primaryText.content_type.name == TRIX_SECTIONS_TYPE
		)
	})
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
	var attrs

	try { attrs = parse(req.body) }
	catch (err) {
		if (err instanceof HttpError && err.code == 422) {
			res.statusCode = err.code
			res.statusMessage = err.message

			return void res.render("initiatives/update_page.jsx", {
				text: {
					id: err.attributes.basis_id,
					title: err.attributes.title,
					content: err.attributes.content,
					content_type: err.attributes.content_type,
					language: err.attributes.language
				},

				errors: err.errors
			})
		}

		throw err
	}

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
		slug: Initiative.slug(text.title),
		language: text.language
	})

	res.flash("notice",
		initiative.published_at && initiative.language == text.language
		? req.t("INITIATIVE_TEXT_CREATED_IF_PUBLISHED")
		: req.t("INITIATIVE_TEXT_CREATED")
	)

	var path = Initiative.slugPath(initiative)
	if (text.language != initiative.language) path += "?language=" + text.language

	res.statusMessage = "Text Created"
	res.redirect(303, path)
})

var validate = require("root/lib/json_schema").new({
	type: "object",
	additionalProperties: false,
	required: ["title", "content", "language"],

	properties: {
		title: {type: "string", minLength: 1, maxLength: 200},
		content: {type: ["object", "array"]},
		content_type: {enum: [TRIX_CONTENT_TYPE, TRIX_SECTIONS_TYPE]},
		language: {enum: Config.initiativeLanguages},
		basis_id: {type: ["number", "null"]}
	}
})

exports.SCHEMA = validate.schema

function parse(obj) {
	var content =
		// If JavaScript is disabled, content is left as an empty string.
		typeof obj.content == "string" && obj.content ? JSON.parse(obj.content)
		: _.isPlainObject(obj.content) ? _.mapValues(obj.content, (content) =>
			content && JSON.parse(content) || []
		)
		: []

	var errors, attrs = {
		title: obj.title,
		content,
		content_type: _.isArray(content) ? TRIX_CONTENT_TYPE : TRIX_SECTIONS_TYPE,
		language: obj.language || Config.language,
		basis_id: Number(obj["basis-id"]) || null
	}

	if (errors = validate(attrs)) throw new HttpError(422, "Invalid Attributes", {
		attributes: attrs,
		errors
	})

	if (
		_.isPlainObject(content) &&
		content.summary &&
		Trix.length(content.summary) > SUMMARY_MAX_LENGTH
	) throw new HttpError(422, "Invalid Attributes", {
		attributes: attrs,

		errors: [{
			keywordLocation: "#/properties/content/maxLength",
			instanceLocation: "#/content/summary"
		}]
	})

	return attrs
}

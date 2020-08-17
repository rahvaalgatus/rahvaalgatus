var _ = require("root/lib/underscore")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var SqliteError = require("root/lib/sqlite_error")
var coauthorsDb = require("root/db/initiative_coauthors_db")
var updateSql = require("heaven-sqlite").update
var sql = require("sqlate")
var next = require("co-next")

exports.router = Router({mergeParams: true})

exports.router.use(function(req, _res, next) {
	var user = req.user
	if (user == null) throw new HttpError(401)

	next()
})

exports.router.get("/", assertCreator, next(function*(req, res) {
	var initiative = req.initiative

	var coauthors = yield coauthorsDb.search(sql`
		SELECT
			author.*,
			user.name AS user_name

		FROM initiative_coauthors AS author
		LEFT JOIN users AS user ON user.id = author.user_id
		WHERE initiative_uuid = ${initiative.uuid}
	`)

	res.render("initiatives/coauthors/index_page.jsx", {
		coauthors: coauthors
	})
}))

exports.router.post("/", assertCreator, next(function*(req, res) {
	var initiative = req.initiative

	try {
		yield coauthorsDb.create({
			initiative_uuid: initiative.uuid,
			user_id: null,
			country: "EE",
			personal_id: req.body.personalId,
			created_at: new Date
		})

		res.flash("notice", req.t("COAUTHORS_PAGE_COAUTHOR_ADDED"))
	}
	catch (ex) {
		if (ex instanceof SqliteError && ex.type == "unique")
			res.flash("error", req.t("COAUTHORS_PAGE_COAUTHOR_DUPLICATE"))
		else
			throw ex
	}

	res.redirect(303, req.baseUrl)
}))

exports.router.put("/:personalId", next(function*(req, res) {
	var user = req.user
	var initiative = req.initiative
	var [country, personalId] = parsePersonalId(req.params.personalId)

	if (!(user.country == country && user.personal_id == personalId))
		throw new HttpError(403, "Not Your Invitation")

	var coauthor = yield coauthorsDb.read(sql`
		SELECT *
		FROM initiative_coauthors
		WHERE initiative_uuid = ${initiative.uuid}
		AND country = ${country}
		AND personal_id = ${personalId}
	`)

	if (coauthor == null)
		throw new HttpError(404, "No Invitation")
	if (coauthor.status != "pending")
		throw new HttpError(405, "Already Responded")

	var attrs = _.assign(parseResponse(req.body), {status_updated_at: new Date})
	attrs.user_id = attrs.status == "accepted" ? user.id : null

	yield coauthorsDb.execute(sql`
		${updateSql("initiative_coauthors", attrs)}
		WHERE initiative_uuid = ${coauthor.initiative_uuid}
		AND country = ${coauthor.country}
		AND personal_id = ${coauthor.personal_id}
	`)

	res.flash("notice", attrs.status == "accepted"
		? req.t("USER_PAGE_COAUTHOR_INVITATION_ACCEPTED")
		: req.t("USER_PAGE_COAUTHOR_INVITATION_REJECTED")
	)

	res.redirect(303, req.body.referrer || req.headers.referer || "/user")
}))

exports.router.delete("/:personalId", assertCreator, next(function*(req, res) {
	var initiative = req.initiative
	var [country, personalId] = parsePersonalId(req.params.personalId)

	yield coauthorsDb.execute(sql`
		DELETE FROM initiative_coauthors
		WHERE initiative_uuid = ${initiative.uuid}
		AND country = ${country}
		AND personal_id = ${personalId}
	`)

	res.flash("notice", req.t("COAUTHORS_PAGE_COAUTHOR_DELETED"))
	res.redirect(303, req.baseUrl)
}))

function assertCreator(req, _res, next) {
	var user = req.user
	var initiative = req.initiative

	if (!(user && initiative.user_id == user.id))
		throw new HttpError(403, "No Permission to Edit Coauthors")

	next()
}

function parseResponse(obj) {
	if (!["accepted", "rejected"].includes(obj.status))
		throw new HttpError(422, "Invalid Status")

	return {status: obj.status}
}

function parsePersonalId(id) { return [id.slice(0, 2), id.slice(2)] }

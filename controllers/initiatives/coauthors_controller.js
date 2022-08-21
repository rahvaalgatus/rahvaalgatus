var _ = require("root/lib/underscore")
var {Router} = require("express")
var HttpError = require("standard-http-error")
var SqliteError = require("root/lib/sqlite_error")
var coauthorsDb = require("root/db/initiative_coauthors_db")
var {parsePersonalId} = require("root/lib/user")
var sql = require("sqlate")

exports.STATUSES = [
	"accepted",
	"pending",
	"rejected",
	"removed",
	"resigned",
	"cancelled",
	"promoted"
]

exports.router = Router({mergeParams: true})

exports.router.use(function(req, _res, next) {
	var {user} = req
	if (user == null) throw new HttpError(401)

	next()
})

exports.router.get("/", assertCreator, function(req, res) {
	var {initiative} = req

	var coauthors = coauthorsDb.search(sql`
		SELECT
			author.*,
			user.name AS user_name

		FROM initiative_coauthors AS author
		LEFT JOIN users AS user ON user.id = author.user_id
		WHERE initiative_uuid = ${initiative.uuid}
		AND status IN ('accepted', 'pending')
	`)

	res.render("initiatives/coauthors/index_page.jsx", {coauthors: coauthors})
})

exports.router.post("/", assertCreator, function(req, res) {
	var {user} = req
	var {initiative} = req
	var personalId = String(req.body.personalId)

	if (personalId == user.personal_id) {
		res.flash("error", req.t("COAUTHORS_PAGE_COAUTHOR_YOURSELF"))
		return void res.redirect(303, req.baseUrl)
	}

	try {
		coauthorsDb.create({
			initiative_uuid: initiative.uuid,
			user_id: null,
			country: "EE",
			personal_id: personalId,
			created_at: new Date,
			created_by_id: user.id,
			status: "pending",
			status_updated_at: new Date,
			status_updated_by_id: user.id
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
})

exports.router.put("/:personalId", function(req, res) {
	var {user} = req
	var {initiative} = req
	var [country, personalId] = parsePersonalId(req.params.personalId)

	if (!(user.country == country && user.personal_id == personalId))
		throw new HttpError(403, "Not Your Invitation")

	var coauthor = coauthorsDb.read(sql`
		SELECT * FROM initiative_coauthors
		WHERE initiative_uuid = ${initiative.uuid}
		AND country = ${country}
		AND personal_id = ${personalId}
		AND status IN ('accepted', 'pending', 'rejected')
		ORDER BY id DESC LIMIT 1
	`)

	if (coauthor == null)
		throw new HttpError(404, "No Invitation")
	if (coauthor.status != "pending")
		throw new HttpError(405, "Already Responded")

	var attrs = _.assign(parseResponse(req.body), {
		user_id: user.id,
		status_updated_at: new Date,
		status_updated_by_id: user.id
	})

	coauthorsDb.update(coauthor, attrs)

	res.statusMessage = attrs.status == "accepted"
		? "Invitation Accepted"
		: "Invitation Rejected"

	res.flash("notice", attrs.status == "accepted"
		? req.t("USER_PAGE_COAUTHOR_INVITATION_ACCEPTED")
		: req.t("USER_PAGE_COAUTHOR_INVITATION_REJECTED")
	)

	res.redirect(303, req.body.referrer || req.headers.referer || "/user")
})

exports.router.delete("/:personalId", function(req, res) {
	var {user} = req
	var {initiative} = req
	var [country, personalId] = parsePersonalId(req.params.personalId)

	// Check permissions before coauthor existence to not leak its presence.
	if (!(
		initiative.user_id == user.id ||
		user.country == country && user.personal_id == personalId
	)) throw new HttpError(403, "No Permission to Edit Coauthors")

	var coauthor = coauthorsDb.read(sql`
		SELECT * FROM initiative_coauthors
		WHERE initiative_uuid = ${initiative.uuid}
		AND country = ${country}
		AND personal_id = ${personalId}
		ORDER BY id DESC LIMIT 1
	`)

	if (coauthor == null)
		throw new HttpError(404, "Coauthor Not Found")

	switch (coauthor.status) {
		case "accepted": break
		case "pending": break

		case "removed": throw new HttpError(410, "Coauthor Already Removed")
		case "resigned": throw new HttpError(410, "Coauthor Already Resigned")
		case "rejected": throw new HttpError(410, "Coauthor Already Rejected")

		case "cancelled":
			throw new HttpError(410, "Coauthor Invitation Already Cancelled")

		default: throw new HttpError(405, "Coauthor Not Deletable")
	}

	var status = initiative.user_id == user.id
		? (coauthor.status == "pending" ? "cancelled" : "removed")
		: (coauthor.status == "pending" ? "rejected" : "resigned")

	coauthorsDb.execute(sql`
		UPDATE initiative_coauthors SET
			${status == "rejected" ? sql`user_id = ${user.id},` : sql``}
			status = ${status},
			status_updated_at = ${new Date},
			status_updated_by_id = ${user.id}

		WHERE id = ${coauthor.id}
	`)

	if (initiative.user_id == user.id) {
		res.statusMessage = coauthor.status == "pending"
			? "Coauthor Invitation Cancelled"
			: "Coauthor Removed"

		res.flash("notice", req.t("COAUTHORS_PAGE_COAUTHOR_DELETED"))
		res.redirect(303, req.baseUrl)
	}
	else {
		res.statusMessage = coauthor.status == "pending"
			? "Invitation Rejected"
			: "Coauthor Resigned"

		res.flash("notice", coauthor.status == "pending"
			? req.t("USER_PAGE_COAUTHOR_INVITATION_REJECTED")
			: req.t("INITIATIVE_COAUTHOR_DELETED_SELF")
		)

		res.redirect(303, req.body.referrer || req.headers.referer || "/user")
	}
})

function assertCreator(req, _res, next) {
	var {user} = req
	var {initiative} = req

	if (initiative.user_id != user.id)
		throw new HttpError(403, "No Permission to Edit Coauthors")

	next()
}

function parseResponse(obj) {
	if (!["accepted", "rejected"].includes(obj.status))
		throw new HttpError(422, "Invalid Status")

	return {status: obj.status}
}

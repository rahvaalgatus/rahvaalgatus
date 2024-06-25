var _ = require("root/lib/underscore")
var Config = require("root").config
var {Router} = require("express")
var HttpError = require("standard-http-error")
var signatureTrusteesDb = require("root/db/initiative_signature_trustees_db")
var sql = require("sqlate")
var {serializePersonalId} = require("root/lib/user")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")

exports.router = Router({mergeParams: true})

exports.router.get("/", function(_req, res) {
	var signatureTrustees = signatureTrusteesDb.search(sql`
		SELECT * FROM initiative_signature_trustees
		WHERE deleted_at IS NULL
	`)

	res.render("admin/destinations/index_page.jsx", {signatureTrustees})
})

exports.router.use("/:destination", function(req, res, next) {
	var gov = LOCAL_GOVERNMENTS[req.params.destination]
	if (gov == null) throw new HttpError(404, "Destination Not Found")

	req.destination = res.locals.destination = req.params.destination
	req.government = gov
	next()
})

exports.router.get("/:destination", function(req, res) {
	var gov = req.government

	var signatureTrustees = signatureTrusteesDb.search(sql`
		SELECT
			trustee.*,
			created_by.name AS created_by_name,
			deleted_by.name AS deleted_by_name

		FROM initiative_signature_trustees AS trustee
		JOIN users AS created_by ON created_by.id = trustee.created_by_id
		LEFT JOIN users AS deleted_by ON deleted_by.id = trustee.deleted_by_id
		WHERE initiative_destination = ${req.destination}
	`)

	res.render("admin/destinations/read_page.jsx", {
		government: gov,
		signatureTrustees
	})
})

exports.router.post("/:destination/signature-trustees", function(req, res) {
	var attrs = parseSignatureTrustee(req.body)

	if (serializePersonalId({
		country: attrs.country,
		personal_id: attrs.personal_id
	}) in Config.admins) throw new HttpError(
		409,
		"Admin Cannot Be Signature Trustee",
		{description: "Sorry, but an admin cannot be a signature trustee."}
	)

	signatureTrusteesDb.create(_.assign(attrs, {
		initiative_destination: req.destination,
		created_at: new Date,
		created_by_id: req.user.id
	}))

	res.statusMessage = "Signature Trustee Created"
	res.flash("signatureTrusteeNotice", "Signature trustee created.")
	res.redirect(302, req.baseUrl + "/" + req.destination + "#signature-trustees")
})

exports.router.delete("/:destination/signature-trustees/:id",
	function(req, res) {
	var trustee = signatureTrusteesDb.read(sql`
		SELECT * FROM initiative_signature_trustees
		WHERE initiative_destination = ${req.destination}
		AND id = ${req.params.id}
	`)

	if (trustee == null) throw new HttpError(404, "Signature Trustee Not Found")

	signatureTrusteesDb.update(trustee, {
		deleted_at: new Date,
		deleted_by_id: req.user.id
	})

	res.statusMessage = "Signature Trustee Deleted"
	res.flash("signatureTrusteeNotice", "Signature trustee deleted.")
	res.redirect(302, req.baseUrl + "/" + req.destination + "#signature-trustees")
})

function parseSignatureTrustee(obj) {
	return {
		country: "EE",
		personal_id: String(obj["personal-id"]),
		name: String(obj.name) || null
	}
}

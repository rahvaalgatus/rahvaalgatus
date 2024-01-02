var _ = require("root/lib/underscore")
var {Router} = require("express")
var DateFns = require("date-fns")
var HttpError = require("standard-http-error")
var Time = require("root/lib/time")
var Csv = require("root/lib/csv")
var signaturesDb = require("root/db/initiative_signatures_db")
var next = require("co-next")
var {formatDate} = require("root/lib/i18n")
var sql = require("sqlate")
var {ENV} = process.env
exports.router = Router({mergeParams: true})
exports.getBirthyearFromPersonalId = getBirthyearFromPersonalId
exports.getSexFromPersonalId = getSexFromPersonalId
exports.getAgeRange = getAgeRange
exports.serializeLocation = serializeLocation

var UNRESTRICTED_COLUMNS = [
	"created_on",
	"initiative_id",
	"initiative_uuid",
	"initiative_title",
	"initiative_destination"
]

var RESTRICTED_COLUMNS = [
	"sex",
	"age_range",
	"method",
	"location"
]

var COLUMNS = _.concat(UNRESTRICTED_COLUMNS, RESTRICTED_COLUMNS)
exports.COLUMNS = COLUMNS
exports.UNRESTRICTED_COLUMNS = UNRESTRICTED_COLUMNS

exports.router.use(function(req, _res, next) {
	if (req.adminPermissions.includes("signatures")) next()
	else next(new HttpError(403, "No Signatures Permission"))
})

exports.router.get("/(:format?)", next(function*(req, res) {
	var from = (
		req.query.from && Time.parseIsoDate(req.query.from) ||
		DateFns.startOfDay(new Date)
	)

	var to = req.query.to ? Time.parseIsoDate(req.query.to) : null
	var timeFormat = req.query["time-format"] || "date"
	var locationFormat = req.query["location-format"] || "text"

	var permittedColumns =
		req.adminPermissions.includes("signatures-with-restricted-columns")
		? COLUMNS
		: UNRESTRICTED_COLUMNS

	var columns = req.query.columns
		? req.query.columns.filter(permittedColumns.includes.bind(permittedColumns))
		: permittedColumns

	var signatureGenerator = searchSignatures(from, to)

	switch (req.accepts(["text/html", "text/csv"])) {
		case "text/csv":
			res.setHeader("Content-Type", "text/csv; charset=utf-8")

			yield serializeSignaturesAsCsv(
				columns,
				timeFormat,
				locationFormat,
				signatureGenerator,
				res
			)
			break

		default: res.render("admin/initiative_signatures/index_page.jsx", {
			from: from,
			to: to,
			columns: columns,
			timeFormat: timeFormat,
			locationFormat: locationFormat,
			signatures: signatureGenerator.next().value || []
		})
	}
}))

function* serializeSignaturesAsCsv(
	columns,
	timeFormat,
	locationFormat,
	signatureGenerator,
	res
) {
	res.write(Csv.serialize(columns.map((column) => (
		column == "created_on"
		? (timeFormat == "date" ? "date" : "week")
		: column == "location"
		? (locationFormat == "text" ? "location" : "geoname_id")
		: column
	))) + "\n")

	for (var sigs of signatureGenerator) {
		sigs = sigs.map((sig) => columns.map((column) => { switch (column) {
			case "created_on": return timeFormat == "date"
				? formatDate("iso", sig.created_at)
				: formatDate("iso-week", sig.created_at)

			case "initiative_id": return sig.initiative_id
			case "initiative_uuid": return sig.initiative_uuid
			case "initiative_title": return sig.initiative_title
			case "initiative_destination": return sig.initiative_destination
			case "sex": return getSexFromPersonalId(sig.personal_id)
			case "age_range": return getAgeRange(
				new Date(getBirthyearFromPersonalId(sig.personal_id), 0, 1),
				sig.created_at
			)

			case "method": return sig.method

			case "location": return sig.created_from
				? (locationFormat == "text"
					? serializeLocation(sig.created_from)
					: sig.created_from.city_geoname_id
				) : ""

			default: throw new RangeError("Unknown column: " + column)
		}}))

		var csv = sigs.map(Csv.serialize).join("\n") + "\n"
		if (res.write(csv) === false) yield _.wait(res, "drain")
	}

	res.end()
}

function getBirthyearFromPersonalId(personalId) {
	var numbers = /^([1-6])(\d\d)/.exec(personalId)
	if (numbers == null) return null

	var [_m, cent, year] = numbers

	return {
		1: 1800,
		2: 1800,
		3: 1900,
		4: 1900,
		5: 2000,
		6: 2000
	}[cent] + Number(year)
}

function getSexFromPersonalId(personalId) {
	switch (personalId[0]) {
		// Smart-Id's test accounts are from the 1800s.
		case "1":
		case "3":
		case "5": return "male"
		case "2":
		case "4":
		case "6": return "female"
		default: throw new RangeError("Time traveller prefix: " + personalId[0])
	}
}

function getAgeRange(birthdate, at) {
	var age = DateFns.differenceInYears(at, birthdate)

	if (age < 16) return "< 16"
	else if (age < 18) return "16–17"
	else if (age < 25) return "18–24"
	else if (age < 35) return "25–34"
	else if (age < 45) return "35–44"
	else if (age < 55) return "45–54"
	else if (age < 65) return "55–64"
	else if (age < 75) return "65–74"
  else return ">= 75"
}

function* searchSignatures(from, to) {
	for (let seen = 0, signatures; (signatures = signaturesDb.search(sql`
		SELECT
			initiative.id AS initiative_id,
			initiative.uuid AS initiative_uuid,
			initiative.title AS initiative_title,
			initiative.destination AS initiative_destination,
			signature.created_at,
			NULL AS created_from,
			signature.personal_id,
			NULL AS method

		FROM initiative_citizenos_signatures AS signature
		JOIN initiatives AS initiative
		ON initiative.uuid = signature.initiative_uuid

		WHERE signature.country = 'EE'
		AND signature.created_at >= ${from}
		${to ? sql`AND signature.created_at < ${to}` : sql``}

		ORDER BY signature.created_at ASC
		LIMIT ${ENV == "test" ? 1 : 10000}
		OFFSET ${seen}
	`)).length > 0; seen += signatures.length) yield _.shuffle(signatures)

	for (let seen = 0, signatures; (signatures = signaturesDb.search(sql`
		SELECT
			initiative.id AS initiative_id,
			initiative.uuid AS initiative_uuid,
			initiative.title AS initiative_title,
			initiative.destination AS initiative_destination,
			signature.created_at,
			signature.created_from,
			signature.personal_id,
			signature.method

		FROM initiative_signatures AS signature
		JOIN initiatives AS initiative
		ON initiative.uuid = signature.initiative_uuid

		WHERE signature.country = 'EE'
		AND signature.created_at >= ${from}
		${to ? sql`AND signature.created_at < ${to}` : sql``}

		ORDER BY signature.created_at ASC
		LIMIT ${ENV == "test" ? 1 : 10000}
		OFFSET ${seen}
	`)).length > 0; seen += signatures.length) yield _.shuffle(signatures)
}

function serializeLocation(from) {
	return _.flatten([
		from.city_name,
		(from.subdivisions || []).map((div) => div.name),
		from.country_name
	]).filter(Boolean).join(", ")
}

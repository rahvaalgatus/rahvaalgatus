var {Router} = require("express")
var DateFns = require("date-fns")
var Time = require("root/lib/time")
var Csv = require("root/lib/csv")
var signaturesDb = require("root/db/initiative_signatures_db")
var next = require("co-next")
var {formatDate} = require("root/lib/i18n")
var sql = require("sqlate")
var concat = Array.prototype.concat.bind(Array.prototype)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
exports.router = Router({mergeParams: true})
exports.getBirthyearFromPersonalId = getBirthyearFromPersonalId
exports.getSexFromPersonalId = getSexFromPersonalId
exports.getAgeRange = getAgeRange
exports.serializeLocation = serializeLocation

var COLUMNS = [
	"created_on",
	"initiative_uuid",
	"initiative_destination",
	"sex",
	"age_range",
	"method",
	"location"
]

exports.COLUMNS = COLUMNS

exports.router.get("/(:format?)", next(function*(req, res) {
	var from = req.query.from
		? Time.parseIsoDate(req.query.from)
		: DateFns.startOfDay(new Date)

	var to = req.query.to ? Time.parseIsoDate(req.query.to) : null
	var timeFormat = req.query["time-format"] || "date"
	var locationFormat = req.query["location-format"] || "text"

	var columns = req.query.columns
		? req.query.columns.filter(COLUMNS.includes.bind(COLUMNS))
		: COLUMNS

	var signatures = yield searchSignatures(from, to)

	switch (req.accepts(["text/csv", "text/html"])) {
		case "text/csv":
			res.setHeader("Content-Type", "text/csv")

			res.end(serializeSignaturesAsCsv(
				columns,
				timeFormat,
				locationFormat,
				signatures
			))
			break

		default: res.render("admin/initiative_signatures/index_page.jsx", {
			from: from,
			to: to,
			columns: columns,
			timeFormat: timeFormat,
			locationFormat: locationFormat,
			signatures: signatures
		})
	}
}))

function serializeSignaturesAsCsv(
	columns,
	timeFormat,
	locationFormat,
	signatures
) {
	var header = columns.map((column) => (
		column == "created_on"
		? (timeFormat == "date" ? "date" : "week")
		: column == "location"
		? (locationFormat == "text" ? "location" : "geoname_id")
		: column
	))

	var rows = signatures.map((sig) => columns.map((column) => { switch (column) {
		case "created_on": return timeFormat == "date"
			? formatDate("iso", sig.created_at)
			: formatDate("iso-week", sig.created_at)

		case "initiative_uuid": return sig.initiative_uuid
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

	return concat([header], rows).map(Csv.serialize).join("\n")
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

function searchSignatures(from, to) {
	return signaturesDb.search(sql`
		WITH signatures AS (
			SELECT
				initiative_uuid,
				created_at,
				created_from,
				country,
				personal_id,
				method

			FROM initiative_signatures

			UNION SELECT
				initiative_uuid,
				created_at,
				NULL AS created_from,
				country,
				personal_id,
				NULL AS method

			FROM initiative_citizenos_signatures
		)

		SELECT
			signature.initiative_uuid,
			initiative.title AS initiative_title,
			initiative.destination AS initiative_destination,
			signature.created_at,
			signature.created_from,
			signature.personal_id,
			signature.method

		FROM signatures AS signature

		JOIN initiatives AS initiative
		ON initiative.uuid = signature.initiative_uuid

		WHERE signature.country = 'EE'
		AND signature.created_at >= ${from}
		${to ? sql`AND signature.created_at < ${to}` : sql``}
		ORDER BY RANDOM()
	`)
}

function serializeLocation(from) {
	return flatten([
		from.city_name,
		(from.subdivisions || []).map((div) => div.name),
		from.country_name
	]).filter(Boolean).join(", ")
}

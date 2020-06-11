var Router = require("express").Router
var DateFns = require("date-fns")
var Time = require("root/lib/time")
var signaturesDb = require("root/db/initiative_signatures_db")
var next = require("co-next")
var formatDate = require("root/lib/i18n").formatDate
var sql = require("sqlate")
var concat = Array.prototype.concat.bind(Array.prototype)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
exports.router = Router({mergeParams: true})
exports.getSexFromPersonalId = getSexFromPersonalId
exports.getBirthdateFromPersonalId = getBirthdateFromPersonalId
exports.getAgeRange = getAgeRange
exports.serializeLocation = serializeLocation

var COLUMNS = [
	"created_on",
	"initiative_uuid",
	"signer_id",
	"signer_ordinal",
	"sex",
	"age_range",
	"location"
]

exports.COLUMNS = COLUMNS

exports.router.get("/(:format?)", next(function*(req, res) {
	var from = req.query.from
		? Time.parseDate(req.query.from)
		: DateFns.addDays(DateFns.startOfDay(new Date), -6)

	var to = req.query.to ? Time.parseDate(req.query.to) : null

	var columns = req.query.columns
		? req.query.columns.filter(COLUMNS.includes.bind(COLUMNS))
		: COLUMNS

	var timeFormat = req.query["time-format"] || "date"

	var signatures = yield signaturesDb.search(sql`
		WITH signatures AS (
			SELECT
				initiative_uuid,
				created_at,
				country,
				personal_id,
				signer_id,
				created_from

			FROM initiative_signatures

			UNION SELECT
				initiative_uuid,
				created_at,
				country,
				personal_id,
				signer_id,
				NULL AS created_from

			FROM initiative_citizenos_signatures
		)

		SELECT
			signature.created_at,
			signature.created_from,
			signature.personal_id,
			signature.signer_id,

			(
				SELECT COUNT(*) FROM signatures
				WHERE signer_id = signature.signer_id
				AND created_at <= signature.created_at
			) AS signer_ordinal,

			signature.initiative_uuid,
			initiative.title AS initiative_title

		FROM signatures AS signature

		JOIN initiatives AS initiative
		ON initiative.uuid = signature.initiative_uuid

		WHERE signature.country = 'EE'
		AND signature.created_at >= ${from}
		${to ? sql`AND signature.created_at < ${to}` : sql``}
		ORDER BY signature.created_at DESC
	`)

	switch (req.accepts(["text/csv", "text/html"])) {
		case "text/csv":
			res.setHeader("Content-Type", "text/csv")
			res.end(serializeSignaturesAsCsv(columns, timeFormat, signatures))
			break

		default: res.render("admin/initiative_signatures/index_page.jsx", {
			from: from,
			to: to,
			columns: columns,
			timeFormat: timeFormat,
			signatures: signatures
		})
	}
}))

function serializeSignaturesAsCsv(columns, timeFormat, signatures) {
	var header = columns.map((column) => (
		column == "created_on" ? (timeFormat == "date" ? "date" : "week") :
		column
	))

	var rows = signatures.map((sig) => columns.map((column) => { switch (column) {
		case "created_on": return timeFormat == "date"
			? formatDate("iso", sig.created_at)
			: formatDate("iso-week", sig.created_at)

		case "initiative_uuid": return sig.initiative_uuid
		case "signer_id": return sig.signer_id
		case "signer_ordinal": return sig.signer_ordinal
		case "sex": return getSexFromPersonalId(sig.personal_id)
		case "age_range": return getAgeRange(
			getBirthdateFromPersonalId(sig.personal_id),
			sig.created_at
		)

		case "location": return sig.created_from
			? serializeLocation(sig.created_from)
			: ""

		default: throw new RangeError("Unknown column: " + column)
	}}))

	return concat([header], rows).map(serializeCsv).join("\n")
}

function serializeCsv(tuple) {
	return tuple.map((value) => (
		/["\r\n,]/.test(value) ? "\"" + value.replace(/"/g, "\"\"") + "\"" : value
	)).join(",")
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

function getBirthdateFromPersonalId(personalId) {
	var [_m, cent, year, month, day] = /^(\d)(\d\d)(\d\d)(\d\d)/.exec(personalId)

	return new Date(
		{1: 1800, 2: 1800, 3: 1900, 4: 1900, 5: 2000, 6: 2000}[cent] + Number(year),
		Number(month) - 1,
		Number(day)
	)
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

function serializeLocation(from) {
	return flatten([
		from.city_name,
		(from.subdivisions || []).map((div) => div.name),
		from.country_name
	]).filter(Boolean).join(", ")
}

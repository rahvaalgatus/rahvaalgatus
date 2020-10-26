var _ = require("root/lib/underscore")
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
	"sex",
	"age_range",
	"location",
	"past_signatures"
]

exports.COLUMNS = COLUMNS

exports.router.get("/(:format?)", next(function*(req, res) {
	var from = req.query.from
		? Time.parseDate(req.query.from)
		: DateFns.startOfDay(new Date)

	var to = req.query.to ? Time.parseDate(req.query.to) : null
	var groupBy = req.query["group-by"] || ""
	var timeFormat = req.query["time-format"] || "date"
	var locationFormat = req.query["location-format"] || "text"

	var columns = req.query.columns
		? req.query.columns.filter(COLUMNS.includes.bind(COLUMNS))
		: COLUMNS

	var signatures, signers
	if (groupBy == "signer") signers = yield searchSigners(from, to)
	else signatures = yield searchSignatures(from, to)

	if (groupBy == "signer") columns = _.difference(columns, [
		"created_on",
		"initiative_uuid"
	])

	switch (req.accepts(["text/csv", "text/html"])) {
		case "text/csv":
			res.setHeader("Content-Type", "text/csv")

			if (signers) res.end(serializeSignersAsCsv(
				columns,
				locationFormat,
				signers
			))
			else res.end(serializeSignaturesAsCsv(
				columns,
				timeFormat,
				locationFormat,
				signatures
			))
			break

		default: res.render("admin/initiative_signatures/index_page.jsx", {
			from: from,
			to: to,
			groupBy: groupBy,
			columns: columns,
			timeFormat: timeFormat,
			locationFormat: locationFormat,
			signatures: signatures,
			signers: signers
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
		case "sex": return getSexFromPersonalId(sig.personal_id)
		case "age_range": return getAgeRange(
			getBirthdateFromPersonalId(sig.personal_id),
			sig.created_at
		)

		case "location": return sig.created_from
			? (locationFormat == "text"
				? serializeLocation(sig.created_from)
				: sig.created_from.city_geoname_id
			) : ""

		case "past_signatures": return sig.past_signatures
		default: throw new RangeError("Unknown column: " + column)
	}}))

	return concat([header], rows).map(serializeCsv).join("\n")
}

function serializeSignersAsCsv(columns, locationFormat, signers) {
	var header = columns.map((column) => (
		column == "location"
		? (locationFormat == "text" ? "location" : "geoname_id")
		: column
	))

	var rows = signers.map((sig) => columns.map((column) => { switch (column) {
		case "sex": return getSexFromPersonalId(sig.personal_id)
		case "age_range": return getAgeRange(
			getBirthdateFromPersonalId(sig.personal_id),
			sig.created_at
		)

		case "location": return sig.created_from
			? (locationFormat == "text"
				? serializeLocation(sig.created_from)
				: sig.created_from.city_geoname_id
			) : ""

		case "past_signatures": return sig.past_signatures
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

function searchSignatures(from, to) {
	return signaturesDb.search(sql`
		WITH signatures AS (
			SELECT
				initiative_uuid,
				created_at,
				country,
				personal_id,
				created_from

			FROM initiative_signatures

			UNION SELECT
				initiative_uuid,
				created_at,
				country,
				personal_id,
				NULL AS created_from

			FROM initiative_citizenos_signatures
		)

		SELECT
			signature.created_at,
			signature.initiative_uuid,
			initiative.title AS initiative_title,
			signature.personal_id,
			signature.created_from,

			(
				SELECT COUNT(*) FROM signatures
				WHERE country = signature.country
				AND personal_id = signature.personal_id
				AND created_at < signature.created_at
				AND datetime(created_at, 'localtime')
				>= datetime(signature.created_at, 'localtime', '-25 months')
			) AS past_signatures

		FROM signatures AS signature

		JOIN initiatives AS initiative
		ON initiative.uuid = signature.initiative_uuid

		WHERE signature.country = 'EE'
		AND signature.created_at >= ${from}
		${to ? sql`AND signature.created_at < ${to}` : sql``}
		ORDER BY RANDOM()
	`)
}

function searchSigners(from, to) {
	return signaturesDb.search(sql`
		WITH signatures AS (
			SELECT
				created_at,
				country,
				personal_id,
				created_from

			FROM initiative_signatures

			UNION SELECT
				created_at,
				country,
				personal_id,
				NULL AS created_from

			FROM initiative_citizenos_signatures
		)

		SELECT
			signature.personal_id,
			MAX(signature.created_at) AS created_at,
			signature.created_from,
			COUNT(*) AS past_signatures

		FROM signatures AS signature

		WHERE signature.country = 'EE'
		AND signature.created_at >= ${from}
		${to ? sql`AND signature.created_at < ${to}` : sql``}
		GROUP BY signature.personal_id
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

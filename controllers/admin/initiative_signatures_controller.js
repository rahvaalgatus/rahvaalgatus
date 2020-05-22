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

exports.router.get("/(:format?)", next(function*(req, res) {
	var from = req.query.from
		? Time.parseDate(req.query.from)
		: DateFns.addDays(DateFns.startOfDay(new Date), -6)

	var to = req.query.to ? Time.parseDate(req.query.to) : null

	var timeFormat = req.query["time-format"] || "date"

	var withLocation = (
		req.query["with-location"] == null ||
		parseQueryBoolean(req.query["with-location"])
	)

	var signatures = yield signaturesDb.search(sql`
		WITH signatures AS (
			SELECT
				initiative_uuid,
				created_at,
				country,
				personal_id,
				created_from

			FROM initiative_signatures AS signature

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
			signature.created_from,
			signature.personal_id,
			signer.id AS signer_id,
			signature.initiative_uuid,
			initiative.title AS initiative_title

		FROM signatures AS signature

		JOIN initiatives AS initiative
		ON initiative.uuid = signature.initiative_uuid

		LEFT JOIN signers AS signer
		ON signer.country = signature.country
		AND signer.personal_id = signature.personal_id

		WHERE signature.country = 'EE'
		AND signature.created_at >= ${from}
		${to ? sql`AND signature.created_at < ${to}` : sql``}
		ORDER BY signature.created_at DESC
	`)

	switch (req.accepts(["text/csv", "text/html"])) {
		case "text/csv":
			res.setHeader("Content-Type", "text/csv")
			res.end(serializeSignaturesAsCsv(timeFormat, withLocation, signatures))
			break

		default: res.render("admin/initiative_signatures/index_page.jsx", {
			from: from,
			to: to,
			timeFormat: timeFormat,
			withLocation: withLocation,
			signatures: signatures
		})
	}
}))

function serializeSignaturesAsCsv(timeFormat, withLocation, signatures) {
	var header = [
		timeFormat == "date" ? "date" : "week",
		"initiative_uuid",
		"signer_id",
		"sex",
		"age_range",
		withLocation && "location"
	].filter(Boolean)

	return concat([header], signatures.map((sig) => concat(
		timeFormat == "date"
			? formatDate("iso", sig.created_at)
			: formatDate("iso-week", sig.created_at)
		,

		sig.initiative_uuid,
		sig.signer_id,
		getSexFromPersonalId(sig.personal_id),
		getAgeRange(getBirthdateFromPersonalId(sig.personal_id), sig.created_at),

		withLocation ? (
			sig.created_from ? serializeLocation(sig.created_from) : ""
		) : []
	)).map(serializeCsv)).join("\n")
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

function parseQueryBoolean(value) {
	if (value instanceof Array) value = _.last(value)
	return _.parseBoolean(value)
}

var O = require("oolong")
var Qs = require("qs")
var Http = require("http")
var Https = require("https")
var Config = require("root/config")
var HttpAgent = (Config.apiUrl.match(/^https:/) ? Https : Http).Agent
var decodeEntities = require("ent").decode
var concat = Array.prototype.concat.bind(Array.prototype)
var fetch = require("./fetch")
var getRows = O.property("rows")
var PARTNER_ID = Config.apiPartnerId
var PARTNER_IDS = concat(Config.apiPartnerId, O.keys(Config.partners))
var TITLE_REGEXP = /<h([1-6])>\s*([^<\s][^]*?)<\/h\1>/
var UA = require("root/config").userAgent
var ISO8601_DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)\s+/
var LOCAL_DATE = /^(\d\d)\.(\d\d)\.(\d\d\d\d)\s+/

var api = require("fetch-defaults")(fetch, Config.apiUrl, {
	timeout: 10000,

	headers: {
		Accept: "application/json",
		"User-Agent": UA,
		"X-Partner-Id": PARTNER_ID
	},

	agent: process.env.ENV === "test" ? null : new HttpAgent({
		keepAlive: true,
		keepAliveMsecs: 10000,
		maxSockets: 30
	})
})

api = require("fetch-parse")(api, {json: true, "text/html": true})
api = require("fetch-throw")(api)
api = require("./fetch/fetch_nodeify")(api)
exports = module.exports = api
exports.parseCitizenInitiative = parseCitizenInitiative
exports.parseCitizenEvent = parseCitizenEvent
exports.parseCitizenComment = parseCitizenComment

// If not requesting per-status, limit applies to the entire returned set.
// Saving us from pagination for now.
exports.readInitiativesWithStatus = function(status) {
	return exports("/api/topics?" + querify({
		include: ["vote", "event"],
		limit: 100,
		statuses: status,
		sourcePartnerId: PARTNER_IDS,
	})).then(getBody).then(getRows).then(parseCitizenInitiatives)
}

exports.readInitiative = function(id) {
	var res = exports(`/api/topics/${id}?include[]=vote&include[]=event`)
	return res.then(getBody).then(parseCitizenInitiative)
}

exports.translateError = function(t, body) {
	var msg = t(keyifyError(body.status.code))
	if (msg == null && body.status.message) msg = body.status.message
	if (msg == null && body.errors) msg = O.values(body.errors).join(" ")
	return msg
}

function parseCitizenInitiative(obj) {
	obj.createdAt = new Date(obj.createdAt)

	if (obj.description) {
		var title = obj.description.match(TITLE_REGEXP)
		if (title) obj.title = decodeEntities(title[2]).trim()
		obj.html = normalizeInitiativeHtml(obj.description)
	}
	else obj.html = obj.description
	delete obj.description

	return obj
}

function parseCitizenEvent(obj) {
	// Parse dates from the title until CitizenOS supports setting the creation
	// date when necessary.
	var titleAndDate = parsePrefixDate(obj.subject)

	return {
		id: obj.id,
		title: titleAndDate[0],
		text: obj.text,
		createdAt: titleAndDate[1] || new Date(obj.createdAt)
	}
}

function parsePrefixDate(str) {
	var m, date = (
		(m = ISO8601_DATE.exec(str)) ? new Date(m[1], m[2] - 1, m[3]) :
		(m = LOCAL_DATE.exec(str)) ? new Date(m[3], m[2] - 1, m[1]) :
		null
	)
		
	return [m ? str.slice(m[0].length) : str, date]
}

function parseCitizenComment(obj) {
	obj.replies = obj.replies.rows
	return obj
}

function normalizeInitiativeHtml(html) {
	html = html.replace(TITLE_REGEXP, "")
	html = html.match(/<body>([^]*)<\/body>/m)[1]
	html = html.replace(/<h([1-6])>\s*<\/h\1>/g, "")
	html = html.replace(/(?:<br>\s*)+(<h[1-6]>)/g, "$1")
	html = html.replace(/(<\/h[1-6]>)(?:\s*<br>)+/g, "$1")
	html = html.replace(/^\s*(?:<br>\s*)*/, "")
	html = html.replace(/(?:\s*<br>)*\s*$/, "")
	return html
}

function parseCitizenInitiatives(arr) { return arr.map(parseCitizenInitiative) }
function keyifyError(citizenCode) { return `MSG_ERROR_${citizenCode}_VOTE` }
function getBody(res) { return res.body.data }
function querify(qs) { return Qs.stringify(qs, {arrayFormat: "brackets"}) }

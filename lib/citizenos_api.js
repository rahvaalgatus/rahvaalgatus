var O = require("oolong")
var Http = require("http")
var Https = require("https")
var Config = require("root/config")
var HttpAgent = (Config.apiUrl.match(/^https:/) ? Https : Http).Agent
var decodeEntities = require("ent").decode
var fetch = require("./fetch")
var PARTNER_ID = Config.apiPartnerId
var TITLE_REGEXP = /<h([1-6])>\s*([^<\s][^]*?)<\/h\1>/
var UA = require("root/config").userAgent

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

exports.readInitiative = function(id) {
	var res = exports(`/api/topics/${id}?include[]=vote`)
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
	obj.updatedAt = new Date(obj.updatedAt)
	if (obj.endsAt) obj.endsAt = new Date(obj.endsAt)

	if (obj.description) {
		var title = obj.description.match(TITLE_REGEXP)
		if (title) obj.title = decodeEntities(title[2]).trim()
		obj.html = normalizeInitiativeHtml(obj.description)
	}
	else obj.html = obj.description
	delete obj.description

	if (obj.vote) obj.vote.createdAt = new Date(obj.vote.createdAt)
	if (obj.vote) obj.vote.endsAt = new Date(obj.vote.endsAt)

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

function keyifyError(citizenCode) { return `MSG_ERROR_${citizenCode}_VOTE` }
function getBody(res) { return res.body.data }

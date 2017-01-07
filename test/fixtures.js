var _ = require("lodash")
var Crypto = require("crypto")
var fetchDefaults = require("fetch-defaults")
var HEADERS = {"Content-Type": "application/json"}

exports.user = function() {
	beforeEach(function() {
		// https://github.com/mochajs/mocha/issues/2014:
		delete this.request

		var csrfToken = rand(16)

		var cookie = [
			"citizenos_token=" + rand(16),
			"csrf_token=" + csrfToken
		].join("; ")

		this.request = fetchDefaults(this.request, {headers: {Cookie: cookie}})
		this.csrfToken = csrfToken

		this.mitm.on("request", respond.bind(null, "/auth/status", {
			data: {}
		}))
	})
}

exports.respond = respond

function respond(url, json, req, res) {
	if (typeof url === "string") url = _.escapeRegExp(url)
	if (!req.url.match(url)) return
	res.writeHead(200, HEADERS)
	res.end(JSON.stringify(json))
}

function rand(length) { return Crypto.randomBytes(length).toString("hex") }

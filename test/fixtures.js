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
		this.router.get("/api/auth/status", respond.bind(null, {data: {}}))
	})
}

exports.respond = respond

function respond(json, _req, res) {
	res.writeHead(200, HEADERS)
	res.end(JSON.stringify(json))
}

function rand(length) { return Crypto.randomBytes(length).toString("hex") }

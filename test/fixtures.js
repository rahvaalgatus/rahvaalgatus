var pseudoHex = require("root/lib/crypto").pseudoHex
var fetchDefaults = require("fetch-defaults")
var HEADERS = {"Content-Type": "application/json"}

exports.user = function() {
	beforeEach(function() {
		// https://github.com/mochajs/mocha/issues/2014:
		delete this.request

		var csrfToken = pseudoHex(16)

		var cookie = [
			"citizenos_token=" + pseudoHex(16),
			"csrf_token=" + csrfToken
		].join("; ")

		this.request = fetchDefaults(this.request, {headers: {Cookie: cookie}})
		this.csrfToken = csrfToken
		this.router.get("/api/auth/status", respond.bind(null, {data: {}}))
	})
}

exports.csrf = function() {
	beforeEach(function() {
		var csrfToken = pseudoHex(16)
		var cookie = "csrf_token=" + csrfToken
		this.request = fetchDefaults(this.request, {headers: {Cookie: cookie}})
		this.csrfToken = csrfToken
	})
}

exports.respond = respond

function respond(json, _req, res) {
	res.writeHead(200, HEADERS)
	res.end(JSON.stringify(json))
}

var Config = require("root/config")
var newUser = require("root/test/citizenos_fixtures").newUser
var createUser = require("root/test/citizenos_fixtures").createUser
var pseudoHex = require("root/lib/crypto").pseudoHex
var fetchDefaults = require("fetch-defaults")

exports.csrf = function() {
	beforeEach(function() {
		this.csrfToken = pseudoHex(16)

		this.request = fetchDefaults(this.request, {
			cookies: {csrf_token: this.csrfToken}
		})
	})
}

exports.user = function(attrs) {
	beforeEach(function*() {
		// https://github.com/mochajs/mocha/issues/2014:
		delete this.request

		this.user = yield createUser(newUser(attrs))

		this.request = fetchDefaults(this.request, {
			cookies: {[Config.cookieName]: pseudoHex(16)}
		})

		this.router.get("/api/auth/status", respond.bind(null, {data: {
			id: this.user.id,
			name: this.user.name,
			email: this.user.email
		}}))
	})
}

exports.respond = respond

function respond(json, _req, res) {
	res.writeHead(res.statusCode, {"Content-Type": "application/json"})
	res.end(JSON.stringify(json))
}

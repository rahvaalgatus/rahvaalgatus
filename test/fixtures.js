var Config = require("root/config")
var newUuid = require("uuid/v4")
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
	beforeEach(function() {
		// https://github.com/mochajs/mocha/issues/2014:
		delete this.request

		this.user = attrs || {id: newUuid()}

		this.request = fetchDefaults(this.request, {
			cookies: {[Config.cookieName]: pseudoHex(16)}
		})

		this.router.get("/api/auth/status", respond.bind(null, {data: this.user}))
	})
}

exports.respond = respond

function respond(json, _req, res) {
	res.writeHead(res.statusCode, {"Content-Type": "application/json"})
	res.end(JSON.stringify(json))
}

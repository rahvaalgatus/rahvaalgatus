var _ = require("root/lib/underscore")
var Http = require("http")
var Web = require("root/bin/web")
var Cookie = require("tough-cookie").Cookie
var {request} = require("./fixtures")
var fetchDefaults = require("fetch-defaults")
var {wait} = require("root/lib/promise")

exports = module.exports = function() {
	before(exports.listen)
	after(exports.close)
}

exports.listen = function*() {
	this.server = new Http.Server(Web)
	this.server.listen(0, "127.0.0.1")

	yield wait(this.server, "listening")
	this.url = "http://localhost:" + this.server.address().port
	this.request = fetchDefaults(request, this.url)
}

exports.close = function(done) {
	this.server.close(done)
}

exports.parseCookies = function(header) {
	return _.indexBy(header.map(Cookie.parse), "key")
}

exports.serializeCookies = function(cookies) {
	return _.map(cookies, (cookie) => cookie.cookieString()).join("; ")
}

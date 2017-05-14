var Http = require("http")
var Web = require("root/bin/web")
var request = require("root/lib/request")
var fetchDefaults = require("fetch-defaults")
var wait = require("root/lib/promise").wait

exports = module.exports = function() {
	before(exports.listen)
	after(exports.close)
}

exports.listen = function*() {
	// NOTE: CitizenOS for some reason fails to respond with CORS headers if the
	// port number is > 9999.
	this.server = new Http.Server(Web)
	this.server.listen(0, "127.0.0.1")

	yield wait(this.server, "listening")
	this.url = "http://localhost:" + this.server.address().port
	this.request = fetchDefaults(request, this.url)
}

// UI tests keep the connection alive preventing the server from shutting down
// on time. Ignore it for now.
exports.close = function() {
	this.server.close()
}

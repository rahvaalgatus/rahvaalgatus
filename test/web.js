var Http = require("http")
var Config = require("root/config/test")
var request = require("fetch-off/request")
var fetchDefaults = require("fetch-defaults")
var wait = require("root/lib/promise").wait

exports = module.exports = function() {
	before(exports.listen)
	after(exports.close)
}

exports.listen = function*() {
	// NOTE: CitizenOS for some reason fails to respond with CORS headers if the
	// port number is > 9999.
	this.server = new Http.Server(require("root/bin/web"))
	this.server.listen(4666, "127.0.0.1")

	yield wait(this.server, "listening")
	this.url = Config.url + ":" + this.server.address().port
	this.request = fetchDefaults(request, this.url)
}

// UI tests keep the connection alive preventing the server from shutting down
// on time. Ignore it for now.
exports.close = function() {
	this.server.close()
}

var Http = require("http")
var Adm = require("root/bin/adm")
var request = require("root/lib/request")
var fetchDefaults = require("fetch-defaults")
var wait = require("root/lib/promise").wait

exports = module.exports = function() {
	before(exports.listen)
	after(exports.close)
}

exports.listen = function*() {
	this.server = new Http.Server(Adm)
	this.server.listen(0, "127.0.0.1")

	yield wait(this.server, "listening")
	this.url = "http://localhost:" + this.server.address().port
	this.request = fetchDefaults(request, this.url)
}

exports.close = function(done) {
	this.server.close(done)
}

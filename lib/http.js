var Fs = require("fs")
var Url = require("url")
var Http = require("http")
var Config = require("root").config
var {logger} = require("root")
var SITE_HOSTNAME = Url.parse(Config.url).hostname
var PARLIAMENT_SITE_HOSTNAME = Url.parse(Config.parliamentSiteUrl).hostname
var LOCAL_SITE_HOSTNAME = Url.parse(Config.localSiteUrl).hostname

exports.runServer = function(app, port) {
	if (!isFinite(port) && Fs.existsSync(port) && Fs.lstatSync(port).isSocket())
		Fs.unlinkSync(port)

	Http.createServer(app).listen(port, function() {
		// Make world-writable to allow the web server to read and write to it.
		if (!isFinite(port)) Fs.chmodSync(port, 0o777)
		var addr = this.address()

		logger.info("Listening on %s.", typeof addr == "string"
			? addr
			: Url.format({protocol: "http", hostname: addr.address, port: addr.port}))
	})
}

exports.link = function(req, path) {
	return req.protocol + "://" + req.headers.host + path
}

exports.parseRefreshHeader = function(header) {
	var m = /^(\d+); url=(.*)/.exec(header)
	return m && [m[1], m[2]]
}

exports.serializeRefreshHeader = function(seconds, url) {
	return seconds + "; url=" + url
}

exports.validateRedirect = function(req, referrer, fallback) {
	if (!referrer) return fallback

	var referrerHost = Url.parse(referrer, false, true).hostname

	return [
		null,
		req.hostname,
		SITE_HOSTNAME,
		PARLIAMENT_SITE_HOSTNAME,
		LOCAL_SITE_HOSTNAME
	].some((host) => host == referrerHost) ? referrer : fallback
}

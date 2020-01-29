var _ = require("root/lib/underscore")
var Http = require("http")
var Url = require("url")
var Fs = require("fs")
var Cookie = require("tough-cookie").Cookie
var logger = require("root").logger

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

exports.isOk = function(res) {
	return res.statusCode >= 200 && res.statusCode < 300
}

exports.serializeAuth = function(user, password) {
  return new Buffer(user + ":" + password).toString("base64")
}

exports.parseAuth = function(text) {
	var schemeAndAuth = text.split(" ")
	if (schemeAndAuth[0] !== "Basic") return null
	var auth = new Buffer(schemeAndAuth[1], "base64").toString()
	var i = auth.indexOf(":")
	return [auth.slice(0, i), auth.slice(i + 1)]
}

exports.parseCookies = function(header) {
	return _.indexBy(header.map(Cookie.parse), "key")
}

exports.serializeCookies = function(cookies) {
	return _.map(cookies, (cookie) => cookie.cookieString()).join("; ")
}

exports.link = function(req, path) {
	return req.protocol + "://" + req.headers.host + path
}

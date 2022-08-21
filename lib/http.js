var Fs = require("fs")
var Url = require("url")
var Http = require("http")
var {logger} = require("root")

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

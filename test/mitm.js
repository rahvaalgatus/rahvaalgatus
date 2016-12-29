var Mitm = require("mitm")

exports = module.exports = function() {
  beforeEach(exports.listen)
  afterEach(exports.close)
}

exports.listen = function() {
  this.mitm = Mitm()
  this.mitm.on("connect", bypassLocalhost)
  this.mitm.on("request", setImmediate.bind(null, checkIntercept))
}

exports.close = function() {
  this.mitm.disable()
}

function checkIntercept(req, res) {
	if (res.headersSent) return
	res.statusCode = 504
	res.statusMessage = "Not Intercepted: " + req.method + " " + req.url
	res.end()
}

function bypassLocalhost(socket, opts) {
	switch (opts.host) {
		case "localhost":
		case "localhost.rahvaalgatus.ee": socket.bypass(); break
	}
}

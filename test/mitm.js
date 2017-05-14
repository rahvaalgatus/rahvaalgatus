var Mitm = require("mitm")

exports = module.exports = function() {
	beforeEach(exports.listen)
	afterEach(exports.close)
}

exports.listen = function() {
	this.mitm = Mitm()
	this.mitm.on("connect", bypassLocalhost)

	// Using setImmediate for intercept checks failed when using Express Router.
	this.mitm.on("request", setTimeout.bind(null, checkIntercept, 0))
}

exports.close = function() {
	this.mitm.disable()
}

exports.route = function(router, req, res) {
	router(req, res, function(err) {
		if (err == null) return
		res.writeHead(502)
		throw err
	})
}

function checkIntercept(req, res) {
	if (res.headersSent) return
	res.statusCode = 504
	res.statusMessage = "Not Intercepted: " + req.method + " " + req.url
	res.end()
}

function bypassLocalhost(socket, opts) {
	switch (opts.host) {
		case "localhost": socket.bypass(); break
	}
}

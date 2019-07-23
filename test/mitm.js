var Mitm = require("mitm")
var Router = require("express").Router
var parseBody = require("body-parser").json()

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

exports.router = function() {
	this.router = Router().use(parseBody)
	this.mitm.on("request", route.bind(null, this.router))
}

exports.close = function() {
	this.mitm.disable()
}

function route(router, req, res) {
	router(req, res, function(err) {
		if (err == null) return
		res.statusCode = 502
		res.end()
		console.error(err)
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

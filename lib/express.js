var Express = require("express")
var Jade = require("jade")
Jade.filters.javascript = require("root/lib/jade/javascript_filter")
var ENV = process.env.ENV

exports.new = function() {
	var app = Express()
	app.enable("trust proxy", "loopback")
	app.set("view engine", "jade")
	app.locals.pretty = false
	app.locals.require = require
	app.locals.basedir = app.get("views")

	// Set environment for Express so its "finalhandler" middleware doesn't print
	// the entire stacktrace in production.
	app.set("env", ENV)

	app.use((req, res, next) => { res.locals.req = req; next() })

	return app
}

exports.static = Express.static

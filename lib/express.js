var Express = require("express")
var Jade = require("jade")
Jade.filters.javascript = require("root/lib/jade/javascript_filter")

exports.new = function() {
	var app = Express()
	app.enable("trust proxy", "loopback")
	app.set("view engine", "jade")
	app.locals.pretty = false
	app.locals.require = require
	app.locals.basedir = app.get("views")

	app.use((req, res, next) => { res.locals.req = req; next() })

	return app
}

exports.static = Express.static

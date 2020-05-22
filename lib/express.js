var Express = require("express")
var renderJsx = require("j6pack/express")

exports.new = function() {
	var app = Express()
	app.enable("trust proxy", "loopback")
	app.engine(".jsx", renderJsx)

	app.use((req, res, next) => { res.locals.req = req; next() })

	return app
}

exports.static = Express.static

var MediaType = require("medium-type")

module.exports = function(req, _res, next) {
	var type = req.headers["content-type"]
	if (type) req.contentType = MediaType.parse(type)
	next()
}

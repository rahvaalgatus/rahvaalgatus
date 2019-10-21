var _ = require("root/lib/underscore")
var Multer = require("multer")
var MEGABYTE = Math.pow(2, 20)
var multer = new Multer({limits: {fileSize: 5 * MEGABYTE, files: 1}})
var parseFiles = multer.any()
var EMPTY = Object.prototype

module.exports = function(req, res, next) {
	parseFiles(req, res, function(err) {
		if (err) return void next(err)
		req.files = req.files && _.indexBy(req.files, "fieldname") || EMPTY
		next()
	})
}

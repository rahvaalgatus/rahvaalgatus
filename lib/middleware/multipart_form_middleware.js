var Multer = require("multer")
var MEGABYTE = Math.pow(2, 20)
var EMPTY = Object.prototype

module.exports = function(limits) {
	if (limits == null) limits = {fileSize: 5 * MEGABYTE, files: 1}

	var multer = new Multer({limits})
	var parseFiles = multer.any()

	return function(req, res, next) {
		parseFiles(req, res, function(err) {
			if (err) return void next(err)
			req.files = req.files && indexFiles(req.files, "fieldname") || EMPTY
			next()
		})
	}
}

function indexFiles(files) {
	return files.reduce(function(obj, file) {
		var name = file.fieldname
		if (name.endsWith("]")) (obj[name] || (obj[name] = [])).push(file)
		else obj[name] = file
		return obj
	}, Object.create(null))
}

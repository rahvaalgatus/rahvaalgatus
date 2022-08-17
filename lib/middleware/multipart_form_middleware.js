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

// https://github.com/mscdex/dicer/pull/22
//
// When upgrading Multer, take note of
// https://github.com/expressjs/multer/pull/1102.
var DICER_PATH = "multer/node_modules/busboy/node_modules/dicer"
var Dicer = require(DICER_PATH)
var StreamSearch = require(`${DICER_PATH}/node_modules/streamsearch`)

Dicer.prototype.setBoundary = function(boundary) {
  this._bparser = new StreamSearch("\r\n--" + boundary)

	this._bparser.on("info", (isMatch, data, start, end) => {
		try { this._oninfo(isMatch, data, start, end) }
		catch (ex) { this.emit(ex) }
  })
}

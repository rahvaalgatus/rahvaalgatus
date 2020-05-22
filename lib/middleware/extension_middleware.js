var Mime = require("root/lib/mime")
var MediaType = require("medium-type")
var EXTENSION = /\.(\w{1,15})$/

module.exports = function(req, _res, next) {
  var ext = EXTENSION.exec(req.path)
  if (ext == null) return void next()

	var type = Mime.types[ext[1].toLowerCase()]
	if (type == null) return void next()

  req.accept = [MediaType.parse(type)]
	req.headers.accept = type
  req.url = req.url.slice(0, ext.index) + req.url.slice(ext.index+ext[0].length)
  next()
}

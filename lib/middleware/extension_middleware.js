var Mime = require("root/lib/mime")
var MediaType = require("medium-type")
var EXTENSION = /\.(\w+)$/
var DEFAULT = new MediaType("application/octet-stream")

module.exports = function(req, _res, next) {
  var ext = EXTENSION.exec(req.path)
  if (ext == null) return void next()

  req.accept = [new MediaType(Mime.types[ext[1].toLowerCase()] || DEFAULT)]
  req.url = req.url.slice(0, ext.index) + req.url.slice(ext.index+ext[0].length)
  next()
}

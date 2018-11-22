var MediaType = require("medium-type")
var HttpError = require("standard-http-error")

module.exports = function(req, _res, next) {
  var types = parse(req.headers.accept)
  if (types == null) return void next(new HttpError(400, "Bad Accept Header"))

  types = types.filter((type) => type.q > 0)
  types.forEach((type) => delete type.parameters.q)
  types.forEach(deleteDefaultCharset)
  req.accept = types

  next()
}

function parse(accept) {
  try {
    var types = MediaType.split(accept == null ? "*/*" : accept)
    return MediaType.sort(types.map(MediaType))
  }
  catch (ex) { if (ex instanceof SyntaxError) return null; throw ex }
}

function deleteDefaultCharset(type) {
  if (String(type.parameters.charset).toLowerCase() != "utf-8") return
  delete type.parameters.charset
}

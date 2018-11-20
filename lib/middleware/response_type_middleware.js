var HttpError = require("standard-http-error")

exports = module.exports = function(types) {
  this.types = types
  return this.handle.bind(this)
}

exports.prototype.handle = function(req, res, next) {
  var type = find(this.types, req.accept)
  if (type == null) return void next(new HttpError(406))

  res.contentType = type
  next()
}

function find(types, patterns) {
  for (var i = 0; i < patterns.length; ++i)
    for (var j = 0; j < types.length; ++j)
      if (types[j].match(patterns[i])) return types[j]

  return null
}

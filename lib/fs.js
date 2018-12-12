var _ = require("root/lib/underscore")
var Fs = require("fs")
exports = module.exports = Object.create(Fs)

exports.readJsonSync = function(path, opts) {
  return JSON.parse(Fs.readFileSync(path, opts))
}

exports.readTemplateLazy = function(path) {
  var load = _.once(_.compose(_.template, Fs.readFileSync.bind(null, path)))
  return function(locals) { return load()(locals) }
}

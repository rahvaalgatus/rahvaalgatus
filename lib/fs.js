exports = module.exports = Object.create(require("fs"))

exports.readJsonSync = function(path, opts) {
  return JSON.parse(exports.readFileSync(path, opts))
}

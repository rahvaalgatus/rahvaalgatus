var _ = require("root/lib/underscore")
var Fs = require("fs")

exports.read = function(path) {
	return _.merge(
		readJsonSync(__dirname + "/../config/defaults.json"),
		readJsonSync(path)
	)
}

function readJsonSync(path, opts) {
  return JSON.parse(Fs.readFileSync(path, opts))
}

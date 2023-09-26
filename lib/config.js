var _ = require("root/lib/underscore")
var Fs = require("root/lib/fs")

exports.read = function(path) {
	return _.merge(
		Fs.readJsonSync(__dirname + "/../config/defaults.json"),
		Fs.readJsonSync(path)
	)
}

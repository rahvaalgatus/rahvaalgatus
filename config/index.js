var _ = require("root/lib/underscore")
var Fs = require("fs")

module.exports = _.merge(
	readJsonSync(__dirname + "/index.json"),
	readJsonSync(__dirname + "/" + process.env.ENV + ".json")
)

function readJsonSync(path, opts) {
  return JSON.parse(Fs.readFileSync(path, opts))
}

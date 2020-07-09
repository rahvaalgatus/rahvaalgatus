var _ = require("root/lib/underscore")
var Fs = require("fs")
var envPath = __dirname + "/" + process.env.ENV + ".json"

module.exports = _.merge(
	readJsonSync(__dirname + "/index.json"),
	Fs.existsSync(envPath) && readJsonSync(envPath)
)

function readJsonSync(path, opts) {
  return JSON.parse(Fs.readFileSync(path, opts))
}

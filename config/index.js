var O = require("oolong")
var Fs = require("root/lib/fs")
var envPath = __dirname + "/" + process.env.ENV + ".json"

module.exports = O.merge(
	Fs.readJsonSync(__dirname + "/index.json"),
	Fs.existsSync(envPath) && Fs.readJsonSync(envPath)
)

var Fs = require("fs")
var PATH = __dirname + "/" + process.env.ENV + ".json"

module.exports = JSON.parse(Fs.readFileSync(PATH))

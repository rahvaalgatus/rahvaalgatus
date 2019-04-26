var request = require("./fetch")

request = require("fetch-parse")(request, {
	"text/html": true,
	"text/plain": true,
	json: true
})

request = require("./fetch/fetch_nodeify")(request)
module.exports = request

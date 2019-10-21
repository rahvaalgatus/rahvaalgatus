var request = require("./fetch")
request = require("./fetch/fetch_cook")(request)

request = require("fetch-parse")(request, {
	"text/html": true,
	"text/plain": true,
	"image/*": true,
	json: true,
	xml: true
})

request = require("./fetch/fetch_nodeify")(request)
module.exports = request

var request = require("./fetch")
request = require("./fetch/fetch_cook")(request)

request = require("fetch-parse")(request, {
	"text/html": true,
	"text/plain": true,
	"image/*": parseBuffer,
	"application/vnd.etsi.asic-e+zip": parseBuffer,
	"application/vnd.rahvaalgatus.signable": parseBuffer,
	json: true,
	xml: true
})

request = require("./fetch/fetch_nodeify")(request)
module.exports = request

function parseBuffer(res) { return res.arrayBuffer().then(Buffer.from) }

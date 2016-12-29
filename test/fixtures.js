var _ = require("lodash")

exports.respond = respond

function respond(url, json, req, res) {
	if (typeof url === "string") url = _.escapeRegExp(url)
	if (!req.url.match(url)) return
	res.writeHead(200, {"Content-Type": "application/json"})
	res.end(JSON.stringify(json))
}

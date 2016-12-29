var _ = require("lodash")
var fetchDefaults = require("fetch-defaults")

exports.user = function() {
	beforeEach(function() {
		// https://github.com/mochajs/mocha/issues/2014:
		delete this.request

		var token = Math.floor(Math.random() * 1000)
		this.request = fetchDefaults(this.request, {
			headers: {Cookie: "citizenos_token=" + token}
		})

		this.mitm.on("request", respond.bind(null, "/auth/status", {
			data: {}
		}))
	})
}

exports.respond = respond

function respond(url, json, req, res) {
	if (typeof url === "string") url = _.escapeRegExp(url)
	if (!req.url.match(url)) return
	res.writeHead(200, {"Content-Type": "application/json"})
	res.end(JSON.stringify(json))
}

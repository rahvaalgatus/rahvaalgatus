var HttpAgent = require("https").Agent
var fetch = require("./fetch")
var URL = "https://aavik.riigikogu.ee/api/"
var UA = require("root/config").userAgent

var api = require("fetch-defaults")(fetch, URL, {
	timeout: 10000,

	headers: {
		Accept: "application/json",
		"User-Agent": UA
	},

	agent: process.env.ENV === "test" ? null : new HttpAgent({
		keepAlive: true,
		keepAliveMsecs: 10000,
		maxSockets: 4
	})
})

api = require("fetch-parse")(api, {json: true, "text/html": true})
api = require("fetch-throw")(api)
api = require("./fetch/fetch_nodeify")(api)
module.exports = api

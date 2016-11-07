var Config = require("root/config")
var defaults = require("fetch-defaults")
var parseify = require("./request/request_parseify")
var throwify = require("fetch-throw")
var nodeify = require("./request/request_nodeify")

var request = require("./fetch")
request = defaults(request, Config.apiUrl)
request = parseify(request)
request = throwify(request)
request = nodeify(request)
module.exports = request

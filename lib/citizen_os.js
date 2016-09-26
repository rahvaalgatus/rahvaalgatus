var fetchify = require("./request/request_fetchify")
var parseify = require("./request/request_parseify")
var throwify = require("fetch-throw")
var nodeify = require("./request/request_nodeify")

var request = require("./request")
request = fetchify(request)
request = parseify(request)
request = throwify(request)
request = nodeify(request)
module.exports = request

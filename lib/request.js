var request = require("./fetch")
request = require("fetch-formify")(request)
request = require("fetch-parse")(request, {"text/html": true})
request = require("./fetch/fetch_nodeify")(request)
module.exports = request

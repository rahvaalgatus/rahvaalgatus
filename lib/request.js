var request = require("fetch-off/request")
request = require("fetch-jsonify")(request)
request = require("fetch-formify")(request)
module.exports = request

var FetchResponse = require("fetch-off/response")
var assign = require("oolong").assign

exports = module.exports = function(request) {
	return assign(exports.request.bind(null, request), request)
}

exports.request = function(request, url, opts) {
	return request(url, opts).then((res) => new FetchResponse(res))
}

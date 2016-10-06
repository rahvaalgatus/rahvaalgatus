var assign = require("oolong").assign
var fetchDefaults = require("fetch-defaults")

exports = module.exports = function(request) {
	var jsonRequest = fetchDefaults(exports.request.bind(null, request), {
		headers: {Accept: "application/json"}
	})

	return assign(jsonRequest, request)
}

exports.request = function(request, url, opts) {
	return request(url, opts).then(parse)
}

function parse(res) {
	return res.json().then(function(body) {
		res.body = body
		return res
	})
}

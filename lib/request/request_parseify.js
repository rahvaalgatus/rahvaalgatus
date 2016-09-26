var assign = require("oolong").assign

exports = module.exports = function(request) {
	return assign(exports.request.bind(null, request), request)
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

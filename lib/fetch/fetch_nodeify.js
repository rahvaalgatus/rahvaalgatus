var assign = require("oolong").assign

exports = module.exports = function(request) {
	return assign(exports.request.bind(null, request), request)
}

exports.request = function(request, url, opts) {
	return request(url, opts).then(nodeify)
}

function nodeify(res) {
	var msg = res.valueOf()
	if ("body" in res) msg.body = res.body
	return msg
}

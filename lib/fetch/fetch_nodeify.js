var _ = require("root/lib/underscore")

module.exports = function(fetch) {
	return _.assign(function(url, opts) {
		return fetch(url, opts).then(function(res) {
			var msg = res.valueOf()
			if ("body" in res) msg.body = res.body
			return msg
		})
	}, fetch)
}

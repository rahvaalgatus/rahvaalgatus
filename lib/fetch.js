var FetchError = require("fetch-error")
var fetch = require("fetch-off")
fetch = require("fetch-jsonify")(fetch)
exports = module.exports = fetch

exports.catch400 = function(err) {
	if (err instanceof FetchError && err.code === 400) return err.response
	else throw err
}

exports.is = function(code, err) {
	return err instanceof FetchError && err.code === 404
}

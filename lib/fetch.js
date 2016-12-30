var FetchError = require("fetch-error")
var fetch = require("fetch-off")
fetch = require("fetch-jsonify")(fetch)
exports = module.exports = fetch

exports.catch = function(code, err) {
	if (err instanceof FetchError && err.code === code) return err.response
	else throw err
}

exports.is = function(code, err) {
	return err instanceof FetchError && err.code === 404
}

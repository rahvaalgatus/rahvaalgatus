var FetchError = require("fetch-error")

exports.is = function(code, err) {
	return err instanceof FetchError && err.code === code
}

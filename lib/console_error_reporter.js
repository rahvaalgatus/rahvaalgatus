var FetchError = require("fetch-error")
var inspect = require("util").inspect

module.exports = function(err) {
  console.error(inspect(err, {depth: null, colors: true}))

	if (err instanceof FetchError) {
		console.error(inspect(err.response, {depth: null, colors: true}))
	}
}

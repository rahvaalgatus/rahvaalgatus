var FetchError = require("fetch-error")
var {inspect} = require("util")

module.exports = function(err) {
  console.error(color(err))

	if (err instanceof FetchError) {
		console.error(color(err.request))
		console.error(color(err.response))
	}
}

function color(obj) { return inspect(obj, {depth: null, colors: true}) }

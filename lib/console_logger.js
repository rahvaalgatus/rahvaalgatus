var _ = require("./underscore")

exports.info = log.bind(null, console.log.bind(console))
exports.warn = log.bind(null, console.warn.bind(console))
exports.error = log.bind(null, console.error.bind(console))
exports.log = exports.info

function log(to, msg) {
	if (arguments.length == 2 && _.isPlainObject(msg)) to(logfmt(msg))
	else to.apply(null, _.slice(arguments, 1))
}

function logfmt(obj) {
	return _.map(obj, function(value, key) {
		if (value === undefined) return null

		key = /[\s=]/.test(key) ? JSON.stringify(key) : key
		value = JSON.stringify(value)
		return key + "=" + value
	}).filter(Boolean).join(" ")
}

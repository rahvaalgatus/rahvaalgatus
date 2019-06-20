var _ = require("root/lib/underscore")
var COOKIE_HEADER = /^cookie$/i

module.exports = function(fetch) {
	return _.assign(cook.bind(null, fetch), fetch)
}

function cook(fetch, url, opts) {
	if (opts && opts.cookies !== undefined) {
		var cookies = serialize(opts.cookies)
		opts = _.defaults({headers: addCookieHeader(cookies, opts.headers)}, opts)
		delete opts.cookies
	}

	return fetch(url, opts)
}

function serialize(cookies) {
	return _.map(cookies, (value, name) => name + "=" + value).join("; ")
}

function addCookieHeader(value, headers) {
  if (headers && hasCookieHeader(headers)) return headers
  else return _.defaults({Cookie: value}, headers)
}

function hasCookieHeader(headers) {
  for (var name in headers) if (COOKIE_HEADER.test(name)) return true
  return false
}

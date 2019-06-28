var Jsdom = require("jsdom")
var HTMLElement = require("jsdom/lib/jsdom/living").HTMLElement

var reporter = Jsdom.createVirtualConsole()
reporter.on("jsdomError", function(err) { throw err.detail || err })

exports.parse = function(html) {
  return Jsdom.jsdom(html, {virtualConsole: reporter})
}

HTMLElement.prototype.inspect = function() {
	return this.outerHTML
}

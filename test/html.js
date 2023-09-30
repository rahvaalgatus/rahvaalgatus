var _ = require("root/lib/underscore")
var Jsdom = require("jsdom")
var {HTMLElement} = require("jsdom/lib/jsdom/living")
var Util = require("util")
var assert = require("assert")
var FEATURES = _.mapValues(Jsdom.defaultDocumentFeatures, () => false)

assert(FEATURES.ProcessExternalResources === false)
assert(FEATURES.FetchExternalResources === false)

exports.parse = function(html) {
	return Jsdom.jsdom(html, {features: FEATURES})
}

HTMLElement.prototype[Util.inspect.custom] = function() {
	return this.outerHTML
}

var _ = require("root/lib/underscore")
var Jsdom = require("jsdom")
var HTMLElement = require("jsdom/lib/jsdom/living").HTMLElement
var assert = require("assert")
var FEATURES = _.mapValues(Jsdom.defaultDocumentFeatures, () => false)

assert(Jsdom.defaultDocumentFeatures.ProcessExternalResources != null)
assert(Jsdom.defaultDocumentFeatures.FetchExternalResources != null)

exports.parse = function(html) {
	return Jsdom.jsdom(html, {features: FEATURES})
}

HTMLElement.prototype.inspect = function() {
	return this.outerHTML
}

var linkify = require("linkifyjs/string")

var OPTS = {
	// Can't use null link because of Linkify's loose bool checks.
  className: "link",
	// Can't use null target either because of Linkify's loose bool checks.
	target: {url: "_self"},
  attributes: {rel: "external"}
}

module.exports = function(text) {
  return linkify(text, OPTS)
}

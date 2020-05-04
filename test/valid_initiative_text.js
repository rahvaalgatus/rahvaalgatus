var _ = require("root/lib/underscore")
var MediaType = require("medium-type")

module.exports = function(attrs) {
	return _.assign({
		created_at: new Date,
		basis_id: null,
		content: "<p>Hello, world!</p>",
		content_type: new MediaType("text/html")
	}, attrs)
}

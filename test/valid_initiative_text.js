var _ = require("root/lib/underscore")
var MediaType = require("medium-type")
var {newTrixDocument} = require("root/test/fixtures")
var TRIX_TYPE = new MediaType("application/vnd.basecamp.trix+json")

module.exports = function(attrs) {
	return _.assign({
		created_at: new Date,
		basis_id: null,
		title: "Textual title #" + _.uniqueId(),
		content: newTrixDocument("Textual body #" + _.uniqueId()),
		content_type: TRIX_TYPE,
		language: "et"
	}, attrs)
}

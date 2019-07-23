var _ = require("root/lib/underscore")
var newUuid = require("uuid/v4")

module.exports = function(attrs) {
	var createdAt = new Date

	return _.assign({
		initiative_uuid: newUuid(),
		event_id: null,
		external_id: null,
		name: _.uniqueId("document_") + ".pdf",
		title: _.uniqueId("Document "),
		created_at: createdAt,
		updated_at: createdAt,
		content: _.uniqueId("Hello, world ") + "!",
		content_type: "text/plain"
	}, attrs)
}

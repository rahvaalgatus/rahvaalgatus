var _ = require("root/lib/underscore")

module.exports = function(attrs) {
	var createdAt = new Date

	return _.assign({
		initiative_uuid: _.serializeUuid(_.uuidV4()),
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

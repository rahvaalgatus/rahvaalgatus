var _ = require("root/lib/underscore")
var newUuid = require("uuid/v4")

module.exports = function(attrs) {
	var createdAt = new Date

	return _.assign({
		initiative_uuid: newUuid(),
		created_at: createdAt,
		updated_at: createdAt,
		occurred_at: createdAt,
		created_by: null,
		origin: "author",
		external_id: null,
		type: "text",
		title: _.uniqueId("Sent to institute "),
		content: _.uniqueId("Handled by person ")
	}, attrs)
}

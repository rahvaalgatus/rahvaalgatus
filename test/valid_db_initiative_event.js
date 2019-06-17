var _ = require("root/lib/underscore")
var newUuid = require("uuid/v4")

module.exports = function(attrs) {
	var createdAt = new Date

	return _.assign({
		initiative_uuid: newUuid(),
		created_at: createdAt,
		updated_at: createdAt,
		occurred_at: createdAt,
		created_by: newUuid(),
		origin: "author",
		title: _.uniqueId("Sent to institute "),
		text: _.uniqueId("Handled by person ")
	}, attrs)
}

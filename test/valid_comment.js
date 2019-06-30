var _ = require("root/lib/underscore")
var newUuid = require("uuid/v4")

module.exports = function(attrs) {
	var createdAt = new Date

	return _.assign({
		uuid: null,
		initiative_uuid: newUuid(),
		created_at: createdAt,
		updated_at: createdAt,
		parent_id: null,
		user_uuid: newUuid(),
		title: attrs && attrs.parent_id ? "" : _.uniqueId("Title "),
		text: _.uniqueId("Comment ")
	}, attrs)
}

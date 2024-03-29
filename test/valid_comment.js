var _ = require("root/lib/underscore")

module.exports = function(attrs) {
	var createdAt = new Date

	return _.assign({
		uuid: null,
		initiative_uuid: null,
		created_at: createdAt,
		updated_at: createdAt,
		anonymized_at: null,
		parent_id: null,
		title: attrs && attrs.parent_id ? "" : _.uniqueId("Title "),
		text: _.uniqueId("Comment "),
		as_admin: false
	}, attrs)
}

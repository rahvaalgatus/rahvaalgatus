var _ = require("root/lib/underscore")

module.exports = function(attrs) {
	var requestedAt = new Date

	return _.assign({
		origin: null,
		path: null,
		requested_at: requestedAt,
		updated_at: requestedAt,
		status_code: 200,
		status_message: "OK",
		headers: {},
		etag: null,
		body_type: null,
		requested_count: 1,
		updated_count: 1
	}, attrs)
}

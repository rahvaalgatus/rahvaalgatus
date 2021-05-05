var _ = require("root/lib/underscore")
var randomHex = require("root/lib/crypto").randomHex

module.exports = function(attrs) {
	var createdAt = new Date

	return _.assign({
		initiative_uuid: null,
		email: _.uniqueId("user") + "@example.com",
		created_at: createdAt,
		created_ip: null,
		origin: null,
		updated_at: createdAt,
		confirmation_sent_at: null,
		confirmed_at: null,
		update_token: randomHex(8),
		new_interest: false,
		signable_interest: false,
		event_interest: false,
		author_interest: false,
		comment_interest: false
	}, attrs)
}

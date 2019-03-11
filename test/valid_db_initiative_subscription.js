var O = require("oolong")
var newUuid = require("uuid/v4")
var pseudoInt = require("root/lib/crypto").pseudoInt

module.exports = function(attrs) {
	var createdAt = new Date

	return O.assign({
		initiative_uuid: newUuid(),
		email: pseudoInt(100) + "@example.com",
		created_at: createdAt,
		updated_at: createdAt,
		confirmation_sent_at: null,
		confirmation_token: null,
		confirmed_at: null
	}, attrs)
}

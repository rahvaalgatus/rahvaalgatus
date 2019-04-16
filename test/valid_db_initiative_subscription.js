var O = require("oolong")
var newUuid = require("uuid/v4")
var pseudoInt = require("root/lib/crypto").pseudoInt
var randomHex = require("root/lib/crypto").randomHex

module.exports = function(attrs) {
	var createdAt = new Date

	return O.assign({
		initiative_uuid: newUuid(),
		email: pseudoInt(100) + "@example.com",
		created_at: createdAt,
		updated_at: createdAt,
		confirmation_sent_at: null,
		confirmation_token: null,
		confirmed_at: null,
		update_token: randomHex(8)
	}, attrs)
}
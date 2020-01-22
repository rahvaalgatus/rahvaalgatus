var _ = require("root/lib/underscore")
var Crypto = require("crypto")

module.exports = function(attrs) {
	var createdAt = new Date

	return _.assign({
		created_at: createdAt,
		updated_at: createdAt,
		token_sha256: Crypto.randomBytes(32),
		method: "id-card",
		created_ip: null,
		created_user_agent: null,
		deleted_at: null
	}, attrs)
}

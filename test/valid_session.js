var _ = require("root/lib/underscore")
var Crypto = require("crypto")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")

module.exports = function(attrs) {
	var createdAt = new Date
	var token = attrs.token || Crypto.randomBytes(12)

	var session = _.assign({
		created_at: createdAt,
		updated_at: createdAt,
		token_sha256: sha256(token),
		method: "id-card",
		created_ip: null,
		created_user_agent: null,
		deleted_at: null
	}, attrs)

	Object.defineProperty(session, "token", {
		value: token, configurable: true, writable: true
	})

	return session
}

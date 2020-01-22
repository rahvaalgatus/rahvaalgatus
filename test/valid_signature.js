var _ = require("root/lib/underscore")
var {randomPersonalId} = require("./valid_user")

module.exports = function(attrs) {
	var createdAt = new Date

	var country = attrs && attrs.country || "EE"
	var personalId = attrs && attrs.personal_id || randomPersonalId()

	return _.assign({
		created_at: createdAt,
		updated_at: createdAt,
		country: country,
		personal_id: personalId,
		method: "id-card",
		hidden: false,
		oversigned: 0,
		xades: `<XAdESSignatures>${country}${personalId}</XAdESSignatures>`
	}, attrs)
}

var _ = require("root/lib/underscore")

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

function randomPersonalId() {
	return _.padLeft(String(Math.floor(Math.random() * 1e11)), 11, "1")
}

var _ = require("root/lib/underscore")
exports = module.exports = newValidUser
exports.randomPersonalId = randomPersonalId

function newValidUser(attrs) {
	var createdAt = new Date

	var country = attrs && attrs.country || "EE"

	var personalId = attrs && "personal_id" in attrs
		? attrs.personal_id
		: randomPersonalId()

	var name = attrs && attrs.name || "John " + _.uniqueId()

	return _.assign({
		uuid: _.uuidV4(),
		created_at: createdAt,
		updated_at: createdAt,
		country: country,
		email: null,
		unconfirmed_email: null,
		email_confirmation_token: null,
		email_confirmed_at: null,
		email_confirmation_sent_at: null,
		personal_id: personalId,
		language: "et",
		name: name,
		official_name: personalId == null ? null : name,
		merged_with_id: null
	}, attrs)
}

function randomPersonalId() {
	return _.padLeft(String(Math.floor(Math.random() * 1e11)), 11, "1")
}

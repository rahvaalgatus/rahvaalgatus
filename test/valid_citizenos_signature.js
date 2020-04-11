var _ = require("root/lib/underscore")
var {randomPersonalId} = require("./valid_user")

module.exports = function(attrs) {
	var country = attrs && attrs.country || "EE"
	var personalId = attrs && attrs.personal_id || randomPersonalId()

	return _.assign({
		created_at: new Date,
		country: country,
		personal_id: personalId
	}, attrs)
}

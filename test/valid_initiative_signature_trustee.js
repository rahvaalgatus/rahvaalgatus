var _ = require("root/lib/underscore")
var {randomPersonalId} = require("./valid_user")

module.exports = function(attrs) {
	var country = attrs && attrs.country || "EE"
	var personalId = attrs && attrs.personal_id || randomPersonalId()
	var name = attrs && attrs.name || "John " + _.uniqueId()

	return _.assign({
		country,
		personal_id: personalId,
		name,
		created_at: new Date,
		created_by_id: null,
		deleted_at: null,
		deleted_by_id: null
	}, attrs)
}

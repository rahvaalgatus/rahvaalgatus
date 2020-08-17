var _ = require("root/lib/underscore")

module.exports = function(attrs) {
	if (attrs && attrs.user) {
		attrs = _.clone(attrs)
		var user = attrs.user
		delete attrs.user
		attrs.country = user.country
		attrs.personal_id = user.personal_id
		attrs.user_id = user.id
	}

	return _.assign({
		country: "EE",
		created_at: new Date,
		user_id: null,
		status_updated_at: null,
		status: "pending"
	}, attrs)
}

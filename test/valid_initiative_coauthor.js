var _ = require("root/lib/underscore")

module.exports = function(attrs) {
	attrs = _.clone(attrs)

	var defaults = {
		country: "EE",
		created_at: new Date,
		created_by_id: null,
		user_id: null,
		status: "pending",
		status_updated_at: new Date,
		status_updated_by_id: null
	}

	if (attrs && attrs.initiative) {
		var initiative = attrs.initiative
		delete attrs.initiative
		defaults.initiative_uuid = initiative.uuid
		defaults.created_by_id = initiative.user_id

		if (
			attrs.status == "pending" ||
			attrs.status == "cancelled" ||
			attrs.status == "removed"
		) defaults.status_updated_by_id = initiative.user_id
	}

	if (attrs && attrs.user) {
		var user = attrs.user
		delete attrs.user
		defaults.country = user.country
		defaults.personal_id = user.personal_id

		if (
			attrs.status != "pending" &&
			attrs.status != "cancelled"
		) defaults.user_id = user.id

		if (
			attrs.status == "accepted" ||
			attrs.status == "rejected" ||
			attrs.status == "resigned"
		) defaults.status_updated_by_id = user.id
	}

	return _.assign(defaults, attrs)
}

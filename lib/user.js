var _ = require("root/lib/underscore")
var Config = require("root").config

exports.isAdmin = function(user) {
	return _.contains(Config.adminPersonalIds, exports.serializePersonalId(user))
}

exports.serializePersonalId = function(user) {
	return user.country + user.personal_id
}

exports.parsePersonalId = function(id) {
	return [id.slice(0, 2), id.slice(2)]
}

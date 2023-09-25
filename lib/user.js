var Config = require("root").config

exports.isAdmin = function(user) {
	return exports.serializePersonalId(user) in Config.admins
}

exports.getAdminPermissions = function(user) {
	return Config.admins[exports.serializePersonalId(user)]
}

exports.serializePersonalId = function(user) {
	return user.country + user.personal_id
}

exports.parsePersonalId = function(id) {
	return [id.slice(0, 2), id.slice(2)]
}

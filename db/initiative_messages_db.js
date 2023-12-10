var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var {sqlite} = require("root")
exports = module.exports = new Db(Object, sqlite, "initiative_messages")

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		sent_at: attrs.sent_at && new Date(attrs.sent_at),
		sent_to: attrs.sent_to && JSON.parse(attrs.sent_to)
	}, attrs)
}

exports.serialize = function(attrs) {
	var obj = _.clone(attrs)
	if ("sent_to" in attrs) obj.sent_to = JSON.stringify(attrs.sent_to)
	return obj
}

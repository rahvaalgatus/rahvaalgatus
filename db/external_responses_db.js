var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var MediaType = require("medium-type")
var {sqlite} = require("root")
exports = module.exports = new Db(Object, sqlite, "external_responses")

exports.parse = function(attrs) {
	return _.defaults({
		requested_at: attrs.requested_at && new Date(attrs.requested_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		headers: attrs.headers && JSON.parse(attrs.headers),
		body_type: attrs.body_type && MediaType.parse(attrs.body_type)
	}, attrs)
}

exports.serialize = function(model) {
	var obj = _.clone(model)
	if ("headers" in obj) obj.headers = JSON.stringify(obj.headers)
	return obj
}

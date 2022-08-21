var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var Certificate = require("undersign/lib/certificate")
var {sqlite} = require("root")
exports = module.exports = new Db(Object, sqlite, "authentications")

exports.idAttribute = "token"
exports.idColumn = "token"

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		certificate: attrs.certificate && new Certificate(attrs.certificate),
		authenticated: !!attrs.authenticated,
		error: attrs.error && JSON.parse(attrs.error)
	}, attrs)
}

exports.serialize = function(model) {
	var obj = _.clone(model)

	if (model.certificate instanceof Certificate)
		obj.certificate = model.certificate.toBuffer()

	if ("error" in model) obj.error = model.error && stringifyError(model.error)
	return obj
}

function stringifyError(err) {
	return JSON.stringify(_.defaults({
		name: err.name,
		message: err.message,
		stack: err.stack
	}, err))
}

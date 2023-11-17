var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var Certificate = require("undersign/lib/certificate")
var {MobileIdSession} = require("undersign/lib/mobile_id")
var {SmartIdSession} = require("undersign/lib/smart_id")
var {sqlite} = require("root")
exports = module.exports = new Db(Object, sqlite, "authentications")
exports.parseEidSession = parseEidSession
exports.serializeError = serializeError

exports.idAttribute = "token"
exports.idColumn = "token"

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		certificate: attrs.certificate && new Certificate(attrs.certificate),
		authenticated: !!attrs.authenticated,
		error: attrs.error && JSON.parse(attrs.error),

		eid_session:
			attrs.eid_session && parseEidSession(attrs.method, attrs.eid_session)
	}, attrs)
}

exports.serialize = function(model) {
	var obj = _.clone(model)

	if (model.certificate instanceof Certificate)
		obj.certificate = model.certificate.toBuffer()

	if ("error" in model) obj.error = model.error && serializeError(model.error)

	if ("eid_session" in model)
		obj.eid_session = obj.eid_session && JSON.stringify(model.eid_session)

	return obj
}

function parseEidSession(method, json) {
	var obj = JSON.parse(json)
	if (method == "mobile-id") return MobileIdSession.parse(obj)
	if (method == "smart-id") return SmartIdSession.parse(obj)
	return obj
}

function serializeError(err) {
	return JSON.stringify(_.defaults({
		name: err.name,
		message: err.message,
		stack: err.stack
	}, err))
}

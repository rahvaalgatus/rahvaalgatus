var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var Xades = require("undersign/xades")
var {sqlite} = require("root")
var {parseEidSession} = require("./authentications_db")
var {serializeError} = require("./authentications_db")
exports = module.exports = new Db(Object, sqlite, "initiative_signables")

exports.idAttribute = "token"
exports.idColumn = "token"

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		xades: attrs.xades && Xades.parse(attrs.xades),
		signed: !!attrs.signed,
		timestamped: !!attrs.timestamped,
		error: attrs.error && JSON.parse(attrs.error),
		created_from: attrs.created_from && JSON.parse(attrs.created_from),

		eid_session:
			attrs.eid_session && parseEidSession(attrs.method, attrs.eid_session)
	}, attrs)
}

exports.serialize = function(model) {
	var obj = _.clone(model)
	if (model.xades instanceof Xades) obj.xades = String(model.xades)
	if ("error" in model) obj.error = model.error && serializeError(model.error)

	if ("created_from" in model) obj.created_from = model.created_from
		? JSON.stringify(model.created_from)
		: null

	if ("eid_session" in model)
		obj.eid_session = obj.eid_session && JSON.stringify(model.eid_session)

	return obj
}

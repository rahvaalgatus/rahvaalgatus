var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var Xades = require("undersign/xades")
var {sqlite} = require("root")
var {serializeError} = require("./authentications_db")
exports = module.exports = new Db(Object, sqlite, "demo_signatures")

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		xades: attrs.xades && Xades.parse(attrs.xades),
		signed: !!attrs.signed,
		timestamped: !!attrs.timestamped,
		error: attrs.error && JSON.parse(attrs.error)
	}, attrs)
}

exports.serialize = function(model) {
	var obj = _.clone(model)
	if (model.xades instanceof Xades) obj.xades = String(model.xades)
	if ("error" in model) obj.error = model.error && serializeError(model.error)
	return obj
}

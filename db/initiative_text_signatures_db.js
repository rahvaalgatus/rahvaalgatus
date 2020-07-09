var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var Xades = require("undersign/xades")
var MediaType = require("medium-type")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "initiative_text_signatures")

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		xades: attrs.xades && Xades.parse(attrs.xades),
		signable_type: attrs.signable_type && MediaType.parse(attrs.signable_type),
		signed: !!attrs.signed,
		timestamped: !!attrs.timestamped,
		error: attrs.error && JSON.parse(attrs.error)
	}, attrs)
}

exports.serialize = function(model) {
	var obj = _.clone(model)
	if (model.xades instanceof Xades) obj.xades = String(model.xades)
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

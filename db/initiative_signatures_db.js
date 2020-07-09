var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var Xades = require("undersign/xades")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "initiative_signatures")
exports.idAttribute = "token"
exports.idColumn = "token"

exports.parse = function(attrs) {
	// NOTE: Don't parse Xades to save on performance when loading signatures.
	// We also never need the Xades instance again.
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		hidden: !!attrs.hidden,
		created_from: attrs.created_from && JSON.parse(attrs.created_from)
	}, attrs)
}

exports.serialize = function(model) {
	var obj = _.clone(model)
	if (model.xades instanceof Xades) obj.xades = String(model.xades)

	if ("created_from" in model) obj.created_from = model.created_from
		? JSON.stringify(model.created_from)
		: null

	return obj
}

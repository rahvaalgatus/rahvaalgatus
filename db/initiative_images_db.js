var O = require("oolong")
var Db = require("root/lib/db")
var MediaType = require("medium-type")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "initiative_images")
exports.idAttribute = "initiative_uuid"
exports.idColumn = "initiative_uuid"

exports.parse = function(attrs) {
	return O.defaults({
		type: MediaType.parse(attrs.type)
	}, attrs)
}

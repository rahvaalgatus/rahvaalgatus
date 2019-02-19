var O = require("oolong")
var sqlite = require("root").sqlite
var Db = require("root/lib/sqlite_heaven")

exports = module.exports = new Db(Object, sqlite, "initiatives")
exports.idAttribute = "uuid"
exports.idColumn = "uuid"

exports._read = function(query, opts) {
	var self = this

	return Db.prototype._read.call(this, query).then(function(model) {
		if (model) return model

		if (opts && opts.create) switch (self.typeof(query)) {
			case "string": return self.sqlite.create(self.table, {uuid: query})
		}

		return model
	})
}

exports.parse = function(attrs) {
	return O.defaults({
		parliament_api_data:
			attrs.parliament_api_data && JSON.parse(attrs.parliament_api_data),
		sent_to_parliament_at:
			attrs.sent_to_parliament_at && new Date(attrs.sent_to_parliament_at)
	}, attrs)
}

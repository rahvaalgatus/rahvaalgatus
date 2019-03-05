var _ = require("root/lib/underscore")
var O = require("oolong")
var Db = require("root/lib/sqlite_heaven")
var sqlite = require("root").sqlite
var concat = Array.prototype.concat.bind(Array.prototype)

exports = module.exports = new Db(Object, sqlite, "initiatives")
exports.idAttribute = "uuid"
exports.idColumn = "uuid"

exports._read = function(query, opts) {
	var self = this

	return Db.prototype._read.call(this, query).then(function(model) {
		// Until Rahvaalgatus consolidates to a single database, it's convenient to
		// autovivify initiatives in the auxiliary database.
		if (opts && opts.create) switch (self.typeof(query)) {
			case "string":
				if (model) break
				return self.sqlite.create(self.table, {uuid: query})

			case "array":
				if (query.length == model.length) break
				if (!query.every(isString)) break

				var uuids = _.difference(query, model.map((m) => m.uuid))
				var models = self.create(uuids.map((uuid) => ({uuid: uuid})))
				return models.then(concat.bind(null, model))
		}

		return model
	})
}

exports.parse = function(attrs) {
	return O.defaults({
		parliament_api_data: attrs.parliament_api_data &&
			JSON.parse(attrs.parliament_api_data),
		sent_to_parliament_at: attrs.sent_to_parliament_at &&
			new Date(attrs.sent_to_parliament_at),
		finished_in_parliament_at: attrs.finished_in_parliament_at &&
			new Date(attrs.finished_in_parliament_at)
	}, attrs)
}

function isString(value) { return typeof value == "string" }

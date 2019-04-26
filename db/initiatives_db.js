var _ = require("root/lib/underscore")
var O = require("oolong")
var Db = require("heaven-sqlite")
var sqlite = require("root").sqlite
var concat = Array.prototype.concat.bind(Array.prototype)

exports = module.exports = new Db(Object, sqlite, "initiatives")
exports.idAttribute = "uuid"
exports.idColumn = "uuid"

exports._search = function(query, opts) {
	return Db.prototype._search.call(this, query).then((models) => {
		// Until Rahvaalgatus consolidates to a single database, it's convenient to
		// autovivify initiatives in the auxiliary database.
		if (opts && opts.create) switch (this.typeof(query)) {
			case "string":
				if (models.length > 0) break
				return this.create([{uuid: query}])

			case "array":
				if (query.length == models.length) break
				if (!query.every(isString)) break

				var uuids = _.difference(query, models.map((m) => m.uuid))
				var created = this.create(uuids.map((uuid) => ({uuid: uuid})))
				return created.then(concat.bind(null, models))
		}

		return models
	})
}

exports._read = function(query, opts) {
	return Db.prototype._read.call(this, query).then((model) => {
		if (opts && opts.create) switch (this.typeof(query)) {
			case "string":
				if (model) break
				return this.create({uuid: query})
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

exports.serialize = function(attrs) {
	var columns = O.clone(attrs)

	if ("parliament_api_data" in attrs)
		columns.parliament_api_data = JSON.stringify(attrs.parliament_api_data)

	return columns
}

function isString(value) { return typeof value == "string" }

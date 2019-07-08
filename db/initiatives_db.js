var _ = require("root/lib/underscore")
var O = require("oolong")
var Db = require("root/lib/db")
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
				var created = this.create({uuid: query}).then(this.serialize.bind(this))
				return created.then(concat)

			case "array":
				if (query.length == models.length) break
				if (!query.every(isString)) break

				var uuids = _.difference(query, models.map((m) => m.uuid))
				created = this.create(uuids.map((uuid) => ({uuid: uuid})))
				created = created.then((arr) => arr.map(this.serialize.bind(this)))
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
				return this.create({uuid: query}).then(this.serialize.bind(this))
		}

		return model
	})
}

exports.parse = function(attrs) {
	return O.defaults({
		has_paper_signatures: !!attrs.has_paper_signatures,
		organizations: attrs.organizations && JSON.parse(attrs.organizations),
		media_urls: attrs.media_urls && JSON.parse(attrs.media_urls),
		meetings: attrs.meetings && JSON.parse(attrs.meetings),

		sent_to_parliament_at: attrs.sent_to_parliament_at &&
			new Date(attrs.sent_to_parliament_at),
		received_by_parliament_at: attrs.received_by_parliament_at &&
			new Date(attrs.received_by_parliament_at),
		accepted_by_parliament_at: attrs.accepted_by_parliament_at &&
			new Date(attrs.accepted_by_parliament_at),
		finished_in_parliament_at: attrs.finished_in_parliament_at &&
			new Date(attrs.finished_in_parliament_at),
		parliament_api_data: attrs.parliament_api_data &&
			JSON.parse(attrs.parliament_api_data),
		signature_milestones: attrs.signature_milestones &&
			_.mapValues(JSON.parse(attrs.signature_milestones), parseDateTime),
		government_change_urls: attrs.government_change_urls &&
			JSON.parse(attrs.government_change_urls),
		public_change_urls: attrs.public_change_urls &&
			JSON.parse(attrs.public_change_urls)
	}, attrs)
}

exports.serialize = function(attrs) {
	var obj = O.clone(attrs)
	if ("media_urls" in obj) obj.media_urls = JSON.stringify(obj.media_urls)
	if ("meetings" in obj) obj.meetings = JSON.stringify(obj.meetings)

	if ("parliament_api_data" in obj)
		obj.parliament_api_data = JSON.stringify(obj.parliament_api_data)
	if ("organizations" in obj)
		obj.organizations = JSON.stringify(obj.organizations)
	if ("signature_milestones" in obj)
		obj.signature_milestones = JSON.stringify(obj.signature_milestones)
	if ("government_change_urls" in obj)
		obj.government_change_urls = JSON.stringify(obj.government_change_urls)
	if ("public_change_urls" in obj)
		obj.public_change_urls = JSON.stringify(obj.public_change_urls)

	return obj
}

function isString(value) { return typeof value == "string" }
function parseDateTime(string) { return new Date(string) }

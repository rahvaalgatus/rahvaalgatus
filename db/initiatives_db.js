var _ = require("root/lib/underscore")
var O = require("oolong")
var Db = require("root/lib/db")
var MediaType = require("medium-type")
var sqlite = require("root").sqlite
var concat = Array.prototype.concat.bind(Array.prototype)

exports = module.exports = new Db(Object, sqlite, "initiatives")
exports.idAttribute = "uuid"
exports.idColumn = "uuid"

exports._search = function(query, opts) {
	return Db.prototype._search.call(this, query).then((models) => {
		var created

		// Until Rahvaalgatus consolidates to a single database, it's convenient to
		// autovivify initiatives in the auxiliary database.
		if (opts && opts.create) switch (this.typeof(query)) {
			case "string":
				if (models.length > 0) break
				created = this.create(newAttrs(query)).then(this.serialize.bind(this))
				return created.then(concat)

			case "array":
				if (query.length == models.length) break
				if (!query.every(isString)) break

				var uuids = _.difference(query, models.map((m) => m.uuid))
				created = this.create(uuids.map(newAttrs))
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
				return this.create(newAttrs(query)).then(this.serialize.bind(this))
		}

		return model
	})
}

exports.parse = function(attrs) {
	return O.defaults({
		external: !!attrs.external,
		undersignable: !!attrs.undersignable,
		has_paper_signatures: !!attrs.has_paper_signatures,
		organizations: attrs.organizations && JSON.parse(attrs.organizations),
		media_urls: attrs.media_urls && JSON.parse(attrs.media_urls),
		meetings: attrs.meetings && JSON.parse(attrs.meetings),
		created_at: attrs.created_at && new Date(attrs.created_at),
		archived_at: attrs.archived_at && new Date(attrs.archived_at),
		text_type: attrs.text_type && MediaType.parse(attrs.text_type),

		sent_to_parliament_at: attrs.sent_to_parliament_at &&
			new Date(attrs.sent_to_parliament_at),
		sent_to_government_at: attrs.sent_to_government_at &&
			new Date(attrs.sent_to_government_at),
		received_by_parliament_at: attrs.received_by_parliament_at &&
			new Date(attrs.received_by_parliament_at),
		accepted_by_parliament_at: attrs.accepted_by_parliament_at &&
			new Date(attrs.accepted_by_parliament_at),
		finished_in_parliament_at: attrs.finished_in_parliament_at &&
			new Date(attrs.finished_in_parliament_at),
		finished_in_government_at: attrs.finished_in_government_at &&
			new Date(attrs.finished_in_government_at),
		parliament_api_data: attrs.parliament_api_data &&
			JSON.parse(attrs.parliament_api_data),
		parliament_synced_at: attrs.parliament_synced_at &&
			new Date(attrs.parliament_synced_at),
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

function newAttrs(uuid) { return {uuid: uuid, created_at: new Date} }
function isString(value) { return typeof value == "string" }
function parseDateTime(string) { return new Date(string) }

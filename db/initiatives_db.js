var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var MediaType = require("medium-type")
var sql = require("sqlate")
var {sqlite} = require("root")

exports = module.exports = new Db(Object, sqlite, "initiatives")
exports.idAttribute = "uuid"
exports.idColumn = "uuid"

exports.parse = function(attrs) {
	return _.defaults({
		external: !!attrs.external,
		undersignable: !!attrs.undersignable,
		has_paper_signatures: !!attrs.has_paper_signatures,
		organizations: attrs.organizations && JSON.parse(attrs.organizations),
		media_urls: attrs.media_urls && JSON.parse(attrs.media_urls),
		meetings: attrs.meetings && JSON.parse(attrs.meetings),
		created_at: attrs.created_at && new Date(attrs.created_at),
		archived_at: attrs.archived_at && new Date(attrs.archived_at),
		published_at: attrs.published_at && new Date(attrs.published_at),
		text_type: attrs.text_type && MediaType.parse(attrs.text_type),
		tags: attrs.tags && JSON.parse(attrs.tags),

		discussion_ends_at: attrs.discussion_ends_at &&
			new Date(attrs.discussion_ends_at),
		signing_started_at: attrs.signing_started_at &&
			new Date(attrs.signing_started_at),
		signing_ends_at: attrs.signing_ends_at &&
			new Date(attrs.signing_ends_at),
		signing_expired_at: attrs.signing_expired_at &&
			new Date(attrs.signing_expired_at),
		signing_expiration_email_sent_at: attrs.signing_expiration_email_sent_at &&
			new Date(attrs.signing_expiration_email_sent_at),
		sent_to_parliament_at: attrs.sent_to_parliament_at &&
			new Date(attrs.sent_to_parliament_at),
		received_by_parliament_at: attrs.received_by_parliament_at &&
			new Date(attrs.received_by_parliament_at),
		accepted_by_parliament_at: attrs.accepted_by_parliament_at &&
			new Date(attrs.accepted_by_parliament_at),
		finished_in_parliament_at: attrs.finished_in_parliament_at &&
			new Date(attrs.finished_in_parliament_at),
		sent_to_government_at: attrs.sent_to_government_at &&
			new Date(attrs.sent_to_government_at),
		received_by_government_at: attrs.received_by_government_at &&
			new Date(attrs.received_by_government_at),
		accepted_by_government_at: attrs.accepted_by_government_at &&
			new Date(attrs.accepted_by_government_at),
		finished_in_government_at: attrs.finished_in_government_at &&
			new Date(attrs.finished_in_government_at),
		signatures_anonymized_at: attrs.signatures_anonymized_at &&
			new Date(attrs.signatures_anonymized_at),
		signature_threshold_at: attrs.signature_threshold_at &&
			new Date(attrs.signature_threshold_at),

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
	var obj = _.clone(attrs)
	if ("media_urls" in obj) obj.media_urls = JSON.stringify(obj.media_urls)
	if ("meetings" in obj) obj.meetings = JSON.stringify(obj.meetings)
	if ("tags" in obj) obj.tags = JSON.stringify(obj.tags)

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

// Using a subquery is faster than common table expressions (CTEs) and table
// views. SQLite seems to fail to use underlying indices when filtering either.
exports.countSignatures = function(where) {
	return sql`(
		(SELECT COUNT(*) FROM initiative_signatures WHERE ${where})
		+
		(SELECT COUNT(*) FROM initiative_citizenos_signatures WHERE ${where})
	)`
}

function parseDateTime(string) { return new Date(string) }

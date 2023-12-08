var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var {sqlite} = require("root")
var sql = require("sqlate")
exports = module.exports = new Db(Object, sqlite, "initiative_subscriptions")

exports.idAttribute = "update_token"
exports.idColumn = "update_token"

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		confirmed_at: attrs.confirmed_at && new Date(attrs.confirmed_at),

		confirmation_sent_at: attrs.confirmation_sent_at &&
			new Date(attrs.confirmation_sent_at),

		new_interest: !!attrs.new_interest,
		signable_interest: !!attrs.signable_interest,
		event_interest: !!attrs.event_interest,
		comment_interest: !!attrs.comment_interest
	}, attrs)
}

exports.searchConfirmedForNewInitiative = function(initiative) {
	return searchConfirmedByInitiativeIdWith(this, initiative, sql`new_interest`)
}

exports.searchConfirmedForSignableInitiative = function(initiative) {
	return searchConfirmedByInitiativeIdWith(
		this,
		initiative,
		sql`(signable_interest OR event_interest)`
	)
}

exports.searchConfirmedByInitiativeForEvent = function(initiative) {
	return searchConfirmedByInitiativeIdWith(
		this,
		initiative,
		sql`event_interest`
	)
}

exports.searchConfirmedByInitiativeForComment = function(initiative) {
	return searchConfirmedByInitiativeIdWith(
		this,
		initiative,
		sql`comment_interest`
	)
}

exports.countConfirmedByInitiativeId =
	countConfirmedByInitiativeIdWith.bind(null, sql`true`)

exports.countConfirmedByInitiativeIdForEvent =
	countConfirmedByInitiativeIdWith.bind(null, sql`event_interest`)

function countConfirmedByInitiativeIdWith(filter, id) {
	return sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiative_subscriptions
		WHERE (initiative_uuid = ${id} OR initiative_uuid IS NULL)
		AND confirmed_at IS NOT NULL
		AND ${filter}
	`)[0].count
}

function searchConfirmedByInitiativeIdWith(db, {uuid, destination}, filter) {
	return db.search(sql`
		SELECT * FROM (
			SELECT * FROM initiative_subscriptions
			WHERE (initiative_uuid = ${uuid} OR initiative_uuid IS NULL)
			AND (
				initiative_destination IS NULL OR
				initiative_destination = ${destination}
			)
			AND confirmed_at IS NOT NULL
			AND (${filter})
			ORDER BY initiative_uuid IS NOT NULL
		)
		GROUP BY email
		ORDER BY email
	`)
}

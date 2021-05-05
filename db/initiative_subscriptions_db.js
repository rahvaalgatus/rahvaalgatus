var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var sqlite = require("root").sqlite
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
		comment_interest: !!attrs.comment_interest,

		// Author interest is unused, but still present in the database.
		author_interest: !!attrs.author_interest
	}, attrs)
}

exports.searchConfirmedByInitiativeId = function(id) {
	return searchConfirmedByInitiativeIdWith(this, sql`1`, id)
}

exports.searchConfirmedByInitiativeIdWith = function(id, filter) {
	return searchConfirmedByInitiativeIdWith(this, filter, id)
}

exports.searchConfirmedForNewInitiative = function() {
	return searchConfirmedWith(this, sql`new_interest`)
}

exports.searchConfirmedForSignableInitiative = function() {
	return searchConfirmedWith(this, sql`signable_interest`)
}

exports.searchConfirmedByInitiativeIdForEvent = function(id) {
	return searchConfirmedByInitiativeIdWith(this, sql`event_interest`, id)
}

exports.searchConfirmedByInitiativeIdForComment = function(id) {
	return searchConfirmedByInitiativeIdWith(this, sql`comment_interest`, id)
}

exports.countConfirmedByInitiativeId =
	countConfirmedByInitiativeIdWith.bind(null, sql`1`)

exports.countConfirmedByInitiativeIdForEvent =
	countConfirmedByInitiativeIdWith.bind(null, sql`event_interest`)


function searchConfirmedWith(db, filter) {
	return db.search(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid IS NULL
		AND confirmed_at IS NOT NULL
		AND ${filter}
		ORDER BY email
	`)
}

function countConfirmedByInitiativeIdWith(filter, id) {
	return sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiative_subscriptions
		WHERE (initiative_uuid = ${id} OR initiative_uuid IS NULL)
		AND confirmed_at IS NOT NULL
		AND ${filter}
	`).then(_.first).then((row) => row.count)
}

function searchConfirmedByInitiativeIdWith(db, filter, id) {
	return db.search(sql`
		SELECT * FROM (
			SELECT * FROM initiative_subscriptions
			WHERE (initiative_uuid = ${id} OR initiative_uuid IS NULL)
			AND confirmed_at IS NOT NULL
			AND (${filter})
			ORDER BY initiative_uuid IS NOT NULL
		)
		GROUP BY email
		ORDER BY email
	`)
}

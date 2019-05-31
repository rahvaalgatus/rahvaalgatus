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
	}, attrs)
}

exports.searchConfirmedByInitiativeId = function(id) {
	return this.search(sql`
		SELECT * FROM (
			SELECT * FROM initiative_subscriptions
			WHERE (initiative_uuid = ${id} OR initiative_uuid IS NULL)
			AND confirmed_at IS NOT NULL
			ORDER BY initiative_uuid IS NOT NULL
		)
		GROUP BY email
		ORDER BY email
	`)
}

exports.countConfirmedByInitiativeId = function(id) {
	return sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiative_subscriptions
		WHERE (initiative_uuid = ${id} OR initiative_uuid IS NULL)
		AND confirmed_at IS NOT NULL
	`).then(_.first).then((row) => row.count)
}

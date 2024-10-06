var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var sql = require("sqlate")
var {sqlite} = require("root")

exports = module.exports = new Db(
	Object,
	sqlite,
	"initiative_citizenos_signatures"
)

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		anonymized: !!attrs.anonymized
	}, attrs)
}

exports.countByInitiativeUuid = function(uuid) {
	return this.sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiative_citizenos_signatures
		WHERE initiative_uuid = ${uuid}
	`).count
}


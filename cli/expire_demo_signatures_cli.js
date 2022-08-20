var Config = require("root").config
var DateFns = require("date-fns")
var sqlite = require("root").sqlite
var sql = require("sqlate")
var EXPIRATION = Config.demoSignaturesExpirationSeconds

module.exports = function() {
	sqlite(sql`
		UPDATE demo_signatures
		SET xades = NULL
		WHERE updated_at <= ${DateFns.addSeconds(new Date, -EXPIRATION)}
		AND xades IS NOT NULL
	`)
}

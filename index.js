var _ = require("root/lib/underscore")
var lazy = require("lazy-object").defineLazyProperty
var ENV = process.env.ENV

lazy(exports, "errorReporter", function() {
  switch (ENV) {
    case "staging":
    case "production":
			var ErrorReporter = require("root/lib/error_reporter")
			var Config = require("root/config")
			return new ErrorReporter(Config.sentryDsn)

		case "test": return function() {}
		default: return require("root/lib/console_error_reporter")
  }
})

lazy(exports, "sqlite", function() {
	var Fs = require("fs")
	var connect = require("root/lib/sqlite")

	switch (ENV) {
		case "test":
			var sqlite = connect(":memory:")	
			sqlite.batch(String(Fs.readFileSync(__dirname + "/config/database.sql")))
			return sqlite

		default: return connect(__dirname + "/config/" + ENV + ".sqlite3")
	}
})

lazy(exports, "cosDb", function() {
  var Knex = require("knex")
	var env = process.env
  var config = require("root/config").citizenOsDatabase

  return Knex({
    client: "pg",
    debug: false,

    connection: _.defaults({
			host: env.PGHOST || config.host,
			port: env.PGPORT || config.port,
			user: env.PGUSER || config.user,
			password: env.PGPASSWORD || config.password,
			database: env.PGDATABASE || config.database
		}, config),

    acquireConnectionTimeout: 20000,
    pool: {min: 1, max: config.pool}
  })
})

lazy(exports, "sendEmail", function() {
  var config = require("root/config").email

  switch (ENV) {
		case "test": return require("root/lib/test_emailer")(config)
		default: return require("root/lib/emailer")(config)
  }
})

lazy(exports, "logger", function() {
  switch (ENV) {
		case "test": return require("root/lib/null_logger")
		default: return console
  }
})

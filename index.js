var _ = require("lodash")
var lazy = require("lazy-object").defineLazyProperty
var ENV = process.env.ENV

lazy(exports, "errorReporter", function() {
  switch (ENV) {
    case "staging":
    case "production":
			var ErrorReporter = require("root/lib/error_reporter")
			var Config = require("root/config")
			return new ErrorReporter(Config.sentryDsn)

		case "test": return _.noop
		default: return require("root/lib/console_error_reporter")
  }
})

lazy(exports, "sqlite", function() {
	var connect = require("root/lib/sqlite")
	return connect(__dirname + "/config/" + ENV + ".sqlite3")
})

lazy(exports, "cosDb", function() {
  var Knex = require("knex")
  var config = require("root/config").citizenOsDatabase

  return Knex({
    client: "pg",
    debug: false,
    connection: config.uri || config,
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

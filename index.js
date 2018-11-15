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
		default: return _.ary(console.error, 1)
  }
})

lazy(exports, "db", function() {
	var Db = require("root/lib/db")
	return new Db(__dirname + "/db/" + ENV + ".sqlite3")
})

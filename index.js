var _ = require("lodash")
var lazy = require("lazy-object").defineLazyProperty

lazy(exports, "errorReporter", function() {
  switch (process.env.ENV) {
    case "staging":
    case "production":
			var ErrorReporter = require("root/lib/error_reporter")
			var DSN = process.env.SENTRY_DSN || require("root/config").sentryDsn
			return new ErrorReporter(DSN)

		default: return _.ary(console.error, 1)
  }
})

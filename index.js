var _ = require("root/lib/underscore")
var Fs = require("fs")
var Path = require("path")
var Config = require("root/config")
var lazy = require("lazy-object").defineLazyProperty
var ENV = process.env.ENV

// eslint-disable-next-line no-extend-native
Object.defineProperty(Object.prototype, "__proto__", {
  value: undefined, configurable: true, writable: true
})

lazy(exports, "errorReporter", function() {
  switch (ENV) {
    case "staging":
    case "production":
			var ErrorReporter = require("root/lib/error_reporter")
			return new ErrorReporter(Config.sentryDsn)

		case "test": return function() {}
		default: return require("root/lib/console_error_reporter")
  }
})

lazy(exports, "sqlite", function() {
	var connect = require("root/lib/sqlite")

	switch (ENV) {
		case "test":
			var sqlite = connect(":memory:")
			var sql = require("sqlate")
			sqlite.batch(String(Fs.readFileSync(__dirname + "/config/database.sql")))
			sqlite(sql`PRAGMA foreign_keys = ON`) // Schema resets foreign_keys.
			return sqlite

		default: return connect(__dirname + "/config/" + ENV + ".sqlite3")
	}
})

lazy(exports, "sendEmail", function() {
  switch (ENV) {
		case "test": return require("root/lib/test_emailer")(Config.email)
		default: return require("root/lib/emailer")(Config.email)
  }
})

lazy(exports, "logger", function() {
  switch (ENV) {
		case "test": return require("root/lib/null_logger")
		default: return console
  }
})

lazy(exports, "mobileId", function() {
	var MobileId = require("undersign/lib/mobile_id")
	var user = Config.mobileIdUser
	var password = Config.mobileIdPassword

  switch (ENV) {
		case "development":
		case "staging": return MobileId.demo
		default: return new MobileId({user: user, password: password})
  }
})

lazy(exports, "smartId", function() {
	var SmartId = require("undersign/lib/smart_id")
	var user = Config.smartIdUser
	var password = Config.smartIdPassword

  switch (ENV) {
		case "development":
		case "staging": return SmartId.demo
		default: return new SmartId({user: user, password: password})
  }
})

lazy(exports, "tsl", function() {
	var Tsl = require("undersign/lib/tsl")
	var estonia = Tsl.parse(Fs.readFileSync(__dirname + "/config/tsl/ee.xml"))
	var certificates = estonia.certificates

  switch (ENV) {
		case "development":
		case "staging":
			var testPath = __dirname + "/config/tsl/ee_test.xml"
			var test = Tsl.parse(Fs.readFileSync(testPath))
			test.certificates.forEach(certificates.add.bind(certificates))
			return certificates

		case "test":
			var Pem = require("undersign/lib/pem")
			var X509Asn = require("undersign/lib/x509_asn")
			var ISSUER_KEYS = require("root/test/fixtures").ISSUER_KEYS

			var certsByCn = _.fromEntries(certificates.toArray().map((cert) => [
				_.merge({}, ...cert.subject).commonName,
				cert
			]))

			for (var commonName in ISSUER_KEYS) if (commonName in certsByCn) {
				var keys = ISSUER_KEYS[commonName]
				var publicKeyDer = Pem.parse(keys.publicKey)
				var publicKeyAsn = X509Asn.SubjectPublicKeyInfo.decode(publicKeyDer)
				var cert = certsByCn[commonName]
				cert.asn.tbsCertificate.subjectPublicKeyInfo = publicKeyAsn
			}

			return certificates

		default: return certificates
  }
})

lazy(exports, "hades", function() {
	var Hades = require("undersign")

	return new Hades({
		certificates: exports.tsl,
		timemarkUrl: Config.timemarkUrl,
		timestampUrl: Config.timestampUrl
	})
})

lazy(exports, "geoip", function() {
	var Maxmind = require("maxmind")

	var path = Config.geoIpCityPath
	if (path == null) return Promise.resolve(null)
	path = Path.resolve(__dirname, "config", path)

	return new Promise((resolve, reject) => (
		Maxmind.open(path, {cache: {max: 10}}, (err, db) => (
			err ? reject(err) : resolve(db)
		))
	))
})

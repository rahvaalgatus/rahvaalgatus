var Config = require("root/config")
var ValidDemoSignature = require("root/test/valid_demo_signature")
var DateFns = require("date-fns")
var cli = require("root/cli/expire_demo_signatures_cli")
var demoSignaturesDb = require("root/db/demo_signatures_db")
var EXPIRATION = Config.demoSignaturesExpirationSeconds

describe("ExpireDemoSignaturesCli", function() {
	require("root/test/db")()
	require("root/test/time")()

	it("must not clear signatures newer than 15m", function*() {
		var signature = yield demoSignaturesDb.create(new ValidDemoSignature({
			signed: true,
			timestamped: true,
			updated_at: DateFns.addSeconds(new Date, -EXPIRATION + 1)
		}))

		yield cli()

		yield demoSignaturesDb.read(signature).must.then.eql(signature)
	})

	it("must clear signatures older than 15m", function*() {
		var signature = yield demoSignaturesDb.create(new ValidDemoSignature({
			signed: true,
			timestamped: true,
			updated_at: DateFns.addSeconds(new Date, -EXPIRATION)
		}))

		yield cli()

		yield demoSignaturesDb.read(signature).must.then.eql({
			__proto__: signature,
			xades: null
		})
	})
})

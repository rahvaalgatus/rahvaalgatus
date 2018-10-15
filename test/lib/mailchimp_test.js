var Config = require("root/config")
var mailchimp = require("root/lib/mailchimp")
var wait = require("root/lib/promise").wait
var parseAuth = require("root/lib/http").parseAuth

describe("Mailchimp", function() {
	require("root/test/mitm")()

	it("must authenticate to Mailchimp", function*() {
		mailchimp("/3.0/non-existent")
		var req = yield wait(this.mitm, "request")
		req.headers.host.must.equal("us42.api.mailchimp.com")
		var auth = parseAuth(req.headers.authorization)
		auth.must.eql(["", Config.mailchimpApiKey])
		req.res.end()
	})
})

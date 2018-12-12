var createEmailer = require("root/lib/emailer")
var StreamTransport = require("nodemailer/lib/stream-transport")
var streamTransport = new StreamTransport({buffer: true})

describe("Emailer", function() {
	it("must return a function", function() {
		createEmailer({}).must.be.a.function()
	})

  describe("sendEmail", function() {
    it("must send mail to given address", function*() {
      var send = createEmailer({}, streamTransport)
			var res = yield send({to: "user@example.com"})
			res.envelope.to.must.eql(["user@example.com"])
    })

    it("must not send X-Mailer", function*() {
      var send = createEmailer({}, streamTransport)
			var res = yield send({to: "user@example.com"})
      String(res.response).must.not.match(/X-Mailer/i)
    })
  })
})

var Config = require("root/config")
var md5 = require("root/lib/crypto").md5

describe("SubscriptionsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	beforeEach(require("root/test/mitm").router)

	describe("POST /", function() {
		require("root/test/fixtures").csrf()

		it(`must subscribe to Mailchimp list`, function*() {
			var email = "User@example.com"
			var emailHash = hashEmail(email)

			var path = `/3.0/lists/${Config.mailchimpListId}/members/${emailHash}`
			this.router.put(path, function(req, res) {
				req.body.must.eql({
					email_address: email,
					status_if_new: "pending",
					interests: {[Config.mailchimpInterestInAllId]: true},
					ip_signup: "127.0.0.1"
				})

				res.end()
			})

			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: email}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")
		})

		it("must respond with 422 given missing email", function*() {
			var path = `/3.0/lists/${Config.mailchimpListId}/members/${hashEmail("")}`
			this.router.put(path, respondWithMailchimpError.bind(null, {
				type: "http://developer.mailchimp.com/documentation/mailchimp/guides/error-glossary/",
				title: "Invalid Resource",
				status: 400,
				detail: "The resource submitted could not be validated. For field-specific details, see the \"errors\" array.",
				instance: "88d753ef-5540-42e2-8976-d05754580e9e",

				errors: [{
					field: "email_address", message: "This value should not be blank."
				}]
			}))

			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: ""}
			})

			res.statusCode.must.equal(422)
		})

		it("must respond with 422 given invalid email", function*() {
			var email = "fubar"
			var emailHash = hashEmail(email)
			var path = `/3.0/lists/${Config.mailchimpListId}/members/${emailHash}`
			this.router.put(path, respondWithMailchimpError.bind(null, {
				type: "http://developer.mailchimp.com/documentation/mailchimp/guides/error-glossary/",
				title: "Invalid Resource",
				status: 400,
				detail: "Please provide a valid email address.",
				instance: "fec7d7c0-6c0e-405d-a090-0a05cf988f19"
			}))

			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: email}
			})

			res.statusCode.must.equal(422)
		})
	})
})

function respondWithMailchimpError(json, _req, res) {
	if (res.statusCode === 200) res.statusCode = 400
	res.writeHead(res.statusCode, {"Content-Type": "application/problem+json"})
	res.end(JSON.stringify(json))
}

function hashEmail(email) { return md5(email.toLowerCase()) }

var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSignature = require("root/test/valid_signature")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var ValidUser = require("root/test/valid_user")
var Config = require("root/config")
var Crypto = require("crypto")
var Http = require("root/lib/http")
var parseCookies = Http.parseCookies
var parseDom = require("root/lib/dom").parse
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var t = require("root/lib/i18n").t.bind(null, Config.language)

describe("UserController", function() {
	require("root/test/db")()
	require("root/test/web")()
	require("root/test/mitm")()
	beforeEach(require("root/test/mitm").router)

	describe("GET /", function() {
		describe("when not logged in", function() {
			it("must respond with 401 Unauthorized", function*() {
				var res = yield this.request("/user")
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must show name without email", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					name: "John Smith"
				}))

				var res = yield this.request("/user")
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.querySelector("#user form")
				form.elements.name.value.must.equal(this.user.name)
				form.elements.email.value.must.equal("")

				res.body.must.not.include(t("USER_PAGE_EMAIL_UNCONFIRMED"))
			})

			it("must show name and email", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					name: "John Smith",
					email: "john@example.com",
					email_confirmed_at: new Date
				}))

				var res = yield this.request("/user")
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.querySelector("#user form")
				form.elements.name.value.must.equal(this.user.name)
				form.elements.email.value.must.equal(this.user.email)

				res.body.must.not.include(t("USER_PAGE_EMAIL_UNCONFIRMED"))
			})

			it("must show if email unconfirmed", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var res = yield this.request("/user")
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.querySelector("#user form")
				form.elements.email.value.must.equal(this.user.unconfirmed_email)
				form.textContent.must.include(t("USER_PAGE_EMAIL_UNCONFIRMED"))
			})

			it("must show if email confirmed but another set", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					email: "john@example.com",
					email_confirmed_at: new Date,
					unconfirmed_email: "mary@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var res = yield this.request("/user")
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.querySelector("#user form")
				form.elements.email.value.must.equal(this.user.unconfirmed_email)

				form.textContent.must.include(
					t("USER_PAGE_EMAIL_UNCONFIRMED_USING_OLD", {email: this.user.email})
				)
			})

			it("must show reconfirmation link if confirmation never sent",
				function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var res = yield this.request("/user")
				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_EMAIL_RESEND_CONFIRMATION"))
			})

			it("must show reconfirmation link if 10 minutes have passed",
				function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12),
					email_confirmation_sent_at: DateFns.addMinutes(new Date, -10)
				}))

				var res = yield this.request("/user")
				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_EMAIL_RESEND_CONFIRMATION"))
			})

			it("must not show reconfirmation link if less than 10 minutes have passed", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12),
					email_confirmation_sent_at: DateFns.addSeconds(new Date, -600 + 1)
				}))

				var res = yield this.request("/user")
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("USER_EMAIL_RESEND_CONFIRMATION"))
			})

			describe("initiatives", function() {
				it("must show initiative in edit phase", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit"
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var el = dom.querySelector("li.initiative")
					el.innerHTML.must.include(initiative.uuid)
					el.textContent.must.include(this.user.name)
					el.textContent.must.include(initiative.title)
				})

				it("must show initiative in sign phase", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						signing_ends_at: DateFns.addDays(new Date, 1)
					}))

					yield citizenosSignaturesDb.create(_.times(5, () => (
						new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
					)))

					yield signaturesDb.create(_.times(3, () => new ValidSignature({
						initiative_uuid: initiative.uuid
					})))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)
					res.body.must.include(initiative.uuid)
					res.body.must.include(initiative.title)
					res.body.must.include(t("N_SIGNATURES", {votes: 8}))
				})

				it("must not show initiatives from other users", function*() {
					var author = yield usersDb.create(new ValidUser)

					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: author.id,
						phase: "edit"
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)
					res.body.must.not.include(initiative.uuid)
				})

				describe("when undersigned", function() {
					beforeEach(function*() {
						this.author = yield usersDb.create(new ValidUser)
					})

					it("must show signed initiatives", function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign"
						}))

						yield signaturesDb.create(new ValidSignature({
							initiative_uuid: initiative.uuid,
							country: this.user.country,
							personal_id: this.user.personal_id
						}))

						var res = yield this.request("/user")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("li.initiative")
						el.innerHTML.must.include(initiative.uuid)
						el.textContent.must.include(this.author.name)
					})

					it("must not show signed initiatives by other countries",
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign"
						}))

						yield signaturesDb.create(new ValidSignature({
							initiative_uuid: initiative.uuid,
							country: "LT",
							personal_id: this.user.personal_id
						}))

						var res = yield this.request("/user")
						res.statusCode.must.equal(200)
						res.body.must.not.include(initiative.uuid)
					})

					it("must not show signed initiatives by other personal ids",
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign"
						}))

						yield signaturesDb.create(new ValidSignature({
							initiative_uuid: initiative.uuid,
							country: this.user.country,
							personal_id: "38706181337"
						}))

						var res = yield this.request("/user")
						res.statusCode.must.equal(200)
						res.body.must.not.include(initiative.uuid)
					})
				})

				describe("when CitizenOS-signed", function() {
					beforeEach(function*() {
						this.author = yield usersDb.create(new ValidUser)
					})

					it("must show signed initiatives", function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign"
						}))

						yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
							initiative_uuid: initiative.uuid,
							country: this.user.country,
							personal_id: this.user.personal_id
						}))

						var res = yield this.request("/user")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("li.initiative")
						el.innerHTML.must.include(initiative.uuid)
						el.textContent.must.include(this.author.name)
					})

					it("must not show signed initiatives by other countries",
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign"
						}))

						yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
							initiative_uuid: initiative.uuid,
							country: "LT",
							personal_id: this.user.personal_id
						}))

						var res = yield this.request("/user")
						res.statusCode.must.equal(200)
						res.body.must.not.include(initiative.uuid)
					})

					it("must not show signed initiatives by other personal ids",
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign"
						}))

						yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
							initiative_uuid: initiative.uuid,
							country: this.user.country,
							personal_id: "38706181337"
						}))

						var res = yield this.request("/user")
						res.statusCode.must.equal(200)
						res.body.must.not.include(initiative.uuid)
					})
				})
			})
		})
	})

	describe("PUT /", function() {
		require("root/test/fixtures").csrfRequest()

		describe("when not logged in", function() {
			it("must ignore names", function*() {
				var user = yield usersDb.create(new ValidUser({name: "Mary Smith"}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {name: "John Smitheroon"}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/")
				yield usersDb.read(user).must.then.eql(user)
			})

			;["et", "en", "ru"].forEach(function(lang) {
				it("must update language to " + lang, function*() {
					var res = yield this.request("/user", {
						method: "PUT",
						headers: {Referer: this.url + "/initiatives"},
						form: {language: lang}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(this.url + "/initiatives")

					var cookies = parseCookies(res.headers["set-cookie"])
					cookies.language.value.must.equal(lang)
					cookies.must.not.have.property("flash")
				})
			})

			it("must ignore invalid language", function*() {
				var res = yield this.request("/user", {
					method: "PUT",
					form: {language: "69"}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/")
				res.headers.must.not.have.property("set-cookie")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()
			require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))
			require("root/test/email")()

			it("must update name", function*() {
				var res = yield this.request("/user", {
					method: "PUT",
					form: {name: "John Smitheroon"}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/user")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED"))

				yield usersDb.read(this.user).must.then.eql({
					__proto__: this.user,
					name: "John Smitheroon",
					updated_at: new Date
				})
			})

			it("must show error if name invalid", function*() {
				var res = yield this.request("/user", {
					method: "PUT",
					form: {name: ""}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Attributes")

				var dom = parseDom(res.body)
				var form = dom.querySelector("#user form")
				form.elements.name.value.must.equal("")
				form.textContent.must.include(t("INPUT_ERROR_LENGTH_1"))

				yield usersDb.read(this.user).must.then.eql(this.user)
			})

			it("must not update name of another user", function*() {
				var user = yield usersDb.create(new ValidUser({name: "Mary Smith"}))
				
				var res = yield this.request("/user", {
					method: "PUT",
					form: {name: "John Smitheroon"}
				})

				res.statusCode.must.equal(303)
				yield usersDb.read(user).must.then.eql(user)
			})

			;["et", "en", "ru"].forEach(function(lang) {
				it("must update language to " + lang, function*() {
					var res = yield this.request("/user", {
						method: "PUT",
						headers: {Referer: this.url + "/initiatives"},
						form: {language: lang}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(this.url + "/initiatives")

					var cookies = parseCookies(res.headers["set-cookie"])
					cookies.language.value.must.equal(lang)
					cookies.must.not.have.property("flash")

					yield usersDb.read(this.user).must.then.eql({
						__proto__: this.user,
						language: lang,
						updated_at: new Date
					})
				})
			})

			it("must ignore invalid language", function*() {
				var res = yield this.request("/user", {
					method: "PUT",
					form: {language: "69"}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/user")
				yield usersDb.read(this.user).must.then.eql(this.user)
			})

			it("must set email and send confirmation", function*() {
				var res = yield this.request("/user", {
					method: "PUT",
					form: {email: "john@example.com"}
				})

				res.statusCode.must.equal(303)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED_WITH_EMAIL"))

				var user = yield usersDb.read(this.user)

				user.must.eql({
					__proto__: this.user,
					unconfirmed_email: "john@example.com",
					email_confirmation_token: user.email_confirmation_token,
					email_confirmation_sent_at: new Date,
					updated_at: new Date
				})

				user.email_confirmation_token.must.exist()

				this.emails.length.must.equal(1)
				var email = this.emails[0]
				email.envelope.to.must.eql(["john@example.com"])

				var host = Config.url
				var token = user.email_confirmation_token
				email.headers.subject.must.equal(t("CONFIRM_EMAIL_SUBJECT"))
				email.body.must.equal(t("CONFIRM_EMAIL_BODY", {
					url: `${host}/user/email?confirmation-token=${token.toString("hex")}`,
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl,
					twitterUrl: Config.twitterUrl
				}))
			})

			it("must update email and send confirmation if unconfirmed", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12),
					email_confirmation_sent_at: new Date(2015, 5, 18, 12),
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email: "mary@example.com"}
				})

				res.statusCode.must.equal(303)

				var user = yield usersDb.read(this.user)

				user.must.eql({
					__proto__: this.user,
					unconfirmed_email: "mary@example.com",
					email_confirmation_token: user.email_confirmation_token,
					email_confirmation_sent_at: new Date,
					updated_at: new Date
				})

				var token = user.email_confirmation_token
				token.must.exist()
				token.must.not.eql(this.user.email_confirmation_token)

				this.emails.length.must.equal(1)
				var email = this.emails[0]
				email.envelope.to.must.eql(["mary@example.com"])

				var host = Config.url
				email.headers.subject.must.equal(t("CONFIRM_EMAIL_SUBJECT"))
				email.body.must.equal(t("CONFIRM_EMAIL_BODY", {
					url: `${host}/user/email?confirmation-token=${token.toString("hex")}`,
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl,
					twitterUrl: Config.twitterUrl
				}))
			})

			it("must update email and send confirmation if confirmed", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					email: "john@example.com",
					email_confirmed_at: new Date(2015, 5, 18, 12),
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email: "mary@example.com"}
				})

				res.statusCode.must.equal(303)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED_WITH_EMAIL"))

				var user = yield usersDb.read(this.user)

				user.must.eql({
					__proto__: this.user,
					unconfirmed_email: "mary@example.com",
					email_confirmation_token: user.email_confirmation_token,
					updated_at: new Date,
					email_confirmation_sent_at: new Date
				})

				user.email_confirmation_token.must.exist()

				this.emails.length.must.equal(1)
				var email = this.emails[0]
				email.envelope.to.must.eql(["mary@example.com"])

				var host = Config.url
				var token = user.email_confirmation_token
				email.headers.subject.must.equal(t("CONFIRM_EMAIL_SUBJECT"))
				email.body.must.equal(t("CONFIRM_EMAIL_BODY", {
					url: `${host}/user/email?confirmation-token=${token.toString("hex")}`,
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl,
					twitterUrl: Config.twitterUrl
				}))
			})

			it("must update email and send confirmation if confirmed and pending",
				function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					email: "john@example.com",
					email_confirmed_at: new Date(2015, 5, 18, 12),
					unconfirmed_email: "mary@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email: "alice@example.com"}
				})

				res.statusCode.must.equal(303)

				var user = yield usersDb.read(this.user)

				user.must.eql({
					__proto__: this.user,
					unconfirmed_email: "alice@example.com",
					email_confirmation_token: user.email_confirmation_token,
					updated_at: new Date,
					email_confirmation_sent_at: new Date
				})

				var token = user.email_confirmation_token
				token.must.exist()
				token.must.not.eql(this.user.email_confirmation_token)

				this.emails.length.must.equal(1)
				var email = this.emails[0]
				email.envelope.to.must.eql(["alice@example.com"])

				var host = Config.url
				email.headers.subject.must.equal(t("CONFIRM_EMAIL_SUBJECT"))
				email.body.must.equal(t("CONFIRM_EMAIL_BODY", {
					url: `${host}/user/email?confirmation-token=${token.toString("hex")}`,
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl,
					twitterUrl: Config.twitterUrl
				}))
			})

			it("must not send confirmation if new identical to confirmed email",
				function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					email: "john@example.com",
					email_confirmed_at: new Date,
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email: "john@example.com"}
				})

				res.statusCode.must.equal(303)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED"))

				var user = yield usersDb.read(this.user)
				user.must.eql({__proto__: this.user, updated_at: new Date})
				this.emails.length.must.equal(0)
			})

			it("must not send confirmation if new identical to unconfirmed email",
				function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email: "john@example.com"}
				})

				res.statusCode.must.equal(303)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED"))

				var user = yield usersDb.read(this.user)
				user.must.eql({__proto__: this.user, updated_at: new Date})
				this.emails.length.must.equal(0)
			})

			it("must not send confirmation if new identical to unconfirmed_email while confirmed",
				function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					email: "john@example.com",
					email_confirmed_at: new Date,
					unconfirmed_email: "mary@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email: "mary@example.com"}
				})

				res.statusCode.must.equal(303)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED"))

				var user = yield usersDb.read(this.user)
				user.must.eql({__proto__: this.user, updated_at: new Date})
				this.emails.length.must.equal(0)
			})

			it("must not send confirmation if setting back confirmed email",
				function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					email: "john@example.com",
					email_confirmed_at: new Date,
					unconfirmed_email: "mary@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email: "john@example.com"}
				})

				res.statusCode.must.equal(303)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED"))

				var user = yield usersDb.read(this.user)

				user.must.eql({
					__proto__: this.user,
					updated_at: new Date,
					unconfirmed_email: null,
					email_confirmation_token: null
				})

				this.emails.length.must.equal(0)
			})

			it("must delete email given empty", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					email: "john@example.com",
					email_confirmed_at: new Date
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email: ""}
				})

				res.statusCode.must.equal(303)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED"))

				var user = yield usersDb.read(this.user)

				user.must.eql({
					__proto__: this.user,
					email: null,
					email_confirmed_at: null,
					updated_at: new Date
				})

				this.emails.length.must.equal(0)
			})

			it("must delete email and unconfirmed email given empty", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					email: "john@example.com",
					email_confirmed_at: new Date,
					unconfirmed_email: "mary@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email: ""}
				})

				res.statusCode.must.equal(303)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED"))

				var user = yield usersDb.read(this.user)

				user.must.eql({
					__proto__: this.user,
					email: null,
					email_confirmed_at: null,
					unconfirmed_email: null,
					email_confirmation_token: null,
					updated_at: new Date
				})

				this.emails.length.must.equal(0)
			})

			it("must show error if email invalid", function*() {
				var res = yield this.request("/user", {
					method: "PUT",
					form: {email: "@example.com"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Attributes")

				var dom = parseDom(res.body)
				var form = dom.querySelector("#user form")
				form.elements.name.value.must.equal(this.user.name)
				form.elements.email.value.must.equal("@example.com")
				form.textContent.must.include(t("INPUT_ERROR_FORMAT_EMAIL"))

				yield usersDb.read(this.user).must.then.eql(this.user)
				this.emails.length.must.equal(0)
			})

			it("must resend confirmation if 10 minutes have passed", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12),
					email_confirmation_sent_at: DateFns.addMinutes(new Date, -10)
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email_confirmation_sent_at: ""}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/user")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED_WITH_EMAIL"))

				var user = yield usersDb.read(this.user)

				user.must.eql({
					__proto__: this.user,
					updated_at: new Date,
					email_confirmation_sent_at: new Date
				})

				this.emails.length.must.equal(1)
			})

			it("must not resend confirmation if no email set", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					email_confirmation_sent_at: DateFns.addMinutes(new Date, -10)
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email_confirmation_sent_at: ""}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/user")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED"))

				yield usersDb.read(this.user).must.then.eql(this.user)
				this.emails.length.must.equal(0)
			})

			it("must resend confirmation if not sent before", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email_confirmation_sent_at: ""}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/user")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED_WITH_EMAIL"))

				yield usersDb.read(this.user).must.then.eql({
					__proto__: this.user,
					updated_at: new Date,
					email_confirmation_sent_at: new Date
				})

				this.emails.length.must.equal(1)
			})

			it("must not resend confirmation if 10 minutes have not passed",
				function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12),
					email_confirmation_sent_at: DateFns.addSeconds(new Date, -600 + 1)
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email_confirmation_sent_at: ""}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/user")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_UPDATED"))

				yield usersDb.read(this.user).must.then.eql(this.user)
				this.emails.length.must.equal(0)
			})

			it("must not set email_confirmation_sent_at if not empty", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12),
					email_confirmation_sent_at: DateFns.addMinutes(new Date, -10)
				}))

				var res = yield this.request("/user", {
					method: "PUT",
					form: {email_confirmation_sent_at: "2020-01-15T13:37:42Z"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Attributes")
				yield usersDb.read(this.user).must.then.eql(this.user)
			})
		})
	})

	describe("GET /email", function() {
		require("root/test/fixtures").csrfRequest()

		describe("when not logged in", function() {
			it("must respond with 401 if not logged in", function*() {
				var res = yield this.request("/user/email")
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()
			require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

			it("must show error if no token given", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var res = yield this.request("/user/email")
				res.statusCode.must.equal(404)
				res.statusMessage.must.equal("Confirmation Token Missing")
				res.body.must.include(t("USER_EMAIL_CONFIRMATION_TOKEN_MISSING"))
			})

			it("must show error if token invalid", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var res = yield this.request("/user/email?confirmation-token=deadbeef")
				res.statusCode.must.equal(404)
				res.statusMessage.must.equal("Confirmation Token Invalid")
				res.body.must.include(t("USER_EMAIL_CONFIRMATION_TOKEN_INVALID"))
			})

			it("must show message if already confirmed", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					email: "john@example.com",
					email_confirmed_at: new Date
				}))

				var res = yield this.request("/user/email?confirmation-token=deadbeef")
				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/user")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_EMAIL_ALREADY_CONFIRMED"))

				yield usersDb.read(this.user).must.then.eql(this.user)
			})

			it("must confirm email", function*() {
				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var path = "/user/email?confirmation-token="
				path += this.user.email_confirmation_token.toString("hex")
				var res = yield this.request(path)

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/user")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("USER_EMAIL_CONFIRMED"))

				yield usersDb.read(this.user).must.then.eql({
					__proto__: this.user,
					email: "john@example.com",
					email_confirmed_at: new Date,
					unconfirmed_email: null,
					email_confirmation_token: null,
					updated_at: new Date
				})
			})

			it("must show message if email already taken", function*() {
				yield usersDb.create(new ValidUser({
					email: "john@example.com",
					email_confirmed_at: new Date
				}))

				yield usersDb.update(this.user, _.assign(this.user, {
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))

				var path = "/user/email?confirmation-token="
				path += this.user.email_confirmation_token.toString("hex")
				var res = yield this.request(path)

				res.statusCode.must.equal(409)
				res.statusMessage.must.equal("Email Already Taken")
				res.body.must.include(t("USER_EMAIL_ALREADY_TAKEN"))

				yield usersDb.read(this.user).must.then.eql(this.user)
			})
		})
	})
})

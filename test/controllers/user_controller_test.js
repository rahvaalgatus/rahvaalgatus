var _ = require("root/lib/underscore")
var Url = require("url")
var DateFns = require("date-fns")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSignature = require("root/test/valid_signature")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var ValidSubscription = require("root/test/valid_subscription")
var ValidUser = require("root/test/valid_user")
var ValidCoauthor = require("root/test/valid_initiative_coauthor")
var Config = require("root/config")
var Crypto = require("crypto")
var Http = require("root/lib/http")
var parseCookies = Http.parseCookies
var parseDom = require("root/lib/dom").parse
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var coauthorsDb = require("root/db/initiative_coauthors_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var sql = require("sqlate")
var demand = require("must")
var SITE_HOSTNAME = Url.parse(Config.url).hostname
var PARLIAMENT_SITE_HOSTNAME = Url.parse(Config.parliamentSiteUrl).hostname
var LOCAL_SITE_HOSTNAME = Url.parse(Config.localSiteUrl).hostname

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

		;[PARLIAMENT_SITE_HOSTNAME, LOCAL_SITE_HOSTNAME].forEach(function(host) {
			it(`must redirect to ${SITE_HOSTNAME} from ${host}`, function*() {
				var path = "/user?foo=bar"
				var res = yield this.request(path, {headers: {Host: host}})
				res.statusCode.must.equal(301)
				res.headers.location.must.equal(Config.url + path)
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

				it("must show initiatives where coauthor", function*() {
					var author = yield usersDb.create(new ValidUser)

					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: author.id,
						phase: "edit"
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative_uuid: initiative.uuid,
						user: this.user,
						status: "accepted"
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var el = dom.querySelector("li.initiative")
					el.innerHTML.must.include(initiative.uuid)
					el.textContent.must.include(author.name)
				})

				it("must not show coauthor name", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit"
					}))

					var coauthor = yield usersDb.create(new ValidUser)

					yield coauthorsDb.create(new ValidCoauthor({
						initiative_uuid: initiative.uuid,
						user: coauthor,
						status: "accepted"
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var el = dom.querySelector("li.initiative")
					el.innerHTML.must.include(initiative.uuid)
					el.textContent.must.include(this.user.name)
					el.textContent.must.not.include(coauthor.name)
				})

				;["pending", "rejected"].forEach(function(status) {
					it(`must not show initiatives where ${status} coauthor`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: (yield usersDb.create(new ValidUser)).id
						}))

						yield coauthorsDb.create(new ValidCoauthor({
							initiative_uuid: initiative.uuid,
							country: this.user.country,
							personal_id: this.user.personal_id,
							status: status
						}))

						var res = yield this.request("/user")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						demand(dom.querySelector("li.initiative")).be.null()
					})
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

				t("must not show coauthor name from another initiative", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit"
					}))

					var other = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id
					}))

					var coauthor = yield usersDb.create(new ValidUser)

					yield coauthorsDb.create(new ValidCoauthor({
						initiative_uuid: other.uuid,
						user: coauthor,
						status: "accepted"
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var el = dom.querySelector("li.initiative")
					el.innerHTML.must.include(initiative.uuid)
					el.textContent.must.include(this.user.name)
					el.textContent.must.not.include(coauthor.name)
				})

				;["pending", "rejected"].forEach(function(status) {
					it(`must not show ${status} coauthor name`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "edit"
						}))

						var coauthor = yield usersDb.create(new ValidUser)

						yield coauthorsDb.create(new ValidCoauthor({
							initiative_uuid: initiative.uuid,
							country: coauthor.country,
							personal_id: coauthor.personal_id,
							status: status
						}))

						var res = yield this.request("/user")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("li.initiative")
						el.innerHTML.must.include(initiative.uuid)
						el.textContent.must.include(this.user.name)
						el.textContent.must.not.include(coauthor.name)
					})
				})
			})

			describe("coauthor invitations", function() {
				it("must show pending invitation", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative_uuid: initiative.uuid,
						country: this.user.country,
						personal_id: this.user.personal_id,
						status: "pending"
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var el = dom.getElementById("coauthor-invitations")
					el.textContent.must.include(initiative.title)
				})

				it("must not show accepted invitation", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative_uuid: initiative.uuid,
						user: this.user,
						status: "accepted"
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					demand(dom.getElementById("coauthor-invitations")).be.null()
				})

				it("must not show rejected invitation", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative_uuid: initiative.uuid,
						country: this.user.country,
						personal_id: this.user.personal_id,
						status: "rejected"
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					demand(dom.getElementById("coauthor-invitations")).be.null()
					res.body.must.not.include(initiative.uuid)
				})

				it("must not show pending invitations from other users with same country", function*() {
					var other = yield usersDb.create(new ValidUser({
						country: this.user.country
					}))

					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: other.id
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative_uuid: initiative.uuid,
						country: other.country,
						personal_id: other.personal_id,
						status: "pending"
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					demand(dom.getElementById("coauthor-invitations")).be.null()
				})

				it("must not show pending invitations from other users with same personal id", function*() {
					var other = yield usersDb.create(new ValidUser({
						country: "LT",
						personal_id: this.user.personal_id
					}))

					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: other.id
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative_uuid: initiative.uuid,
						country: other.country,
						personal_id: other.personal_id,
						status: "pending"
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					demand(dom.getElementById("coauthor-invitations")).be.null()
				})
			})
		})
	})

	describe("PUT /", function() {
		require("root/test/fixtures").csrf()

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

			;[PARLIAMENT_SITE_HOSTNAME, LOCAL_SITE_HOSTNAME].forEach(function(host) {
				it(`must set cookie when on ${host}`, function*() {
					var res = yield this.request("/user", {
						method: "PUT",
						headers: {Referer: this.url + "/initiatives", Host: host},
						form: {language: "en"}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(this.url + "/initiatives")

					var cookies = parseCookies(res.headers["set-cookie"])
					cookies.language.value.must.equal("en")
					cookies.must.not.have.property("flash")
				})
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

	describe("GET /signatures", function() {
		require("root/test/fixtures").user()

		describe("when undersigned", function() {
			beforeEach(function*() {
				this.author = yield usersDb.create(new ValidUser)
			})

			it("must show signatures", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				yield signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid,
					country: this.user.country,
					personal_id: this.user.personal_id
				}))

				var res = yield this.request("/user/signatures")
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var el = dom.querySelector(".signature")
				el.innerHTML.must.include(initiative.uuid)
				el.textContent.must.include(initiative.title)
				//el.textContent.must.include(this.author.name)
				el.textContent.must.include(t("DOWNLOAD_SIGNATURE"))
			})

			it("must not show signatures by other countries",
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

				var res = yield this.request("/user/signatures")
				res.statusCode.must.equal(200)
				res.body.must.not.include(initiative.uuid)
			})

			it("must not show signatures by other personal ids",
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

				var res = yield this.request("/user/signatures")
				res.statusCode.must.equal(200)
				res.body.must.not.include(initiative.uuid)
			})

			it("must not show hidden signatures", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				yield signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid,
					country: this.user.country,
					personal_id: this.user.personal_id,
					hidden: true
				}))

				var res = yield this.request("/user/signatures")
				res.statusCode.must.equal(200)
				res.body.must.not.include(initiative.uuid)
			})
		})

		describe("when CitizenOS-signed", function() {
			beforeEach(function*() {
				this.author = yield usersDb.create(new ValidUser)
			})

			it("must show signatures", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid,
					country: this.user.country,
					personal_id: this.user.personal_id
				}))

				var res = yield this.request("/user/signatures")
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var el = dom.querySelector(".signature")
				el.innerHTML.must.include(initiative.uuid)
				el.textContent.must.include(initiative.title)
				el.textContent.must.not.include(t("DOWNLOAD_SIGNATURE"))
			})

			it("must not show signatures by other countries", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid,
					country: "LT",
					personal_id: this.user.personal_id
				}))

				var res = yield this.request("/user/signatures")
				res.statusCode.must.equal(200)
				res.body.must.not.include(initiative.uuid)
			})

			it("must not show signatures by other personal ids", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid,
					country: this.user.country,
					personal_id: "38706181337"
				}))

				var res = yield this.request("/user/signatures")
				res.statusCode.must.equal(200)
				res.body.must.not.include(initiative.uuid)
			})
		})
	})

	describe("GET /subscriptions", function() {
		require("root/test/fixtures").user({
			email: "user@example.com",
			email_confirmed_at: new Date
		})

		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)
		})

		it("must show subscription to initiatives", function*() {
			yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions")
			res.statusCode.must.equal(200)

			var el = parseDom(res.body).querySelectorAll("li.subscription")
			el.length.must.equal(1)
			el[0].textContent.must.include(t("SUBSCRIPTIONS_ALL_INITIATIVES"))
		})

		it("must not show unconfirmed subscription to initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			yield subscriptionsDb.create(new ValidSubscription({
				email: subscription.email
			}))

			var res = yield this.request("/user/subscriptions")
			res.statusCode.must.equal(200)

			var el = parseDom(res.body).querySelectorAll("li.subscription")
			el.length.must.equal(1)
			el[0].innerHTML.must.include(subscription.initiative_uuid)
			el[0].textContent.must.not.include(t("SUBSCRIPTIONS_ALL_INITIATIVES"))
		})

		it("must show subscription to initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				email: this.user.email,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.title)
		})

		it("must show page given subscription to external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				email: this.user.email,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.title)
		})

		it("must not show unconfirmed subscription to initiatives", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var other = yield subscriptionsDb.create(new ValidSubscription({
				email: subscription.email,
				initiative_uuid: initiative.uuid
			}))

			var res = yield this.request("/user/subscriptions")
			res.statusCode.must.equal(200)

			var el = parseDom(res.body).querySelectorAll("li.subscription")
			el.length.must.equal(1)
			el[0].innerHTML.must.not.include(other.initiative_uuid)
			el[0].textContent.must.include(t("SUBSCRIPTIONS_ALL_INITIATIVES"))
		})

		it("must show all subscriptions for given email address", function*() {
			var initiatives = yield _.times(3, () => initiativesDb.create(
				new ValidInitiative({phase: "parliament", external: true})
			))

			yield subscriptionsDb.create(initiatives.map((i) => (
				new ValidSubscription({
					email: this.user.email,
					initiative_uuid: i.uuid,
					confirmed_at: new Date
				})
			)))

			var res = yield this.request("/user/subscriptions")
			res.statusCode.must.equal(200)
			initiatives.forEach((i) => res.body.must.include(i.title))
		})

		it("must not show subscriptions for other email addresses", function*() {
			var other = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: other.uuid,
				confirmed_at: new Date
			}))

			yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions")
			res.statusCode.must.equal(200)
			res.body.must.not.include(other.title)
		})

		it("must not show subscriptions if user email unconfirmed", function*() {
			yield usersDb.update(this.user, {
				email: null,
				email_confirmed_at: null
			})

			yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				email: this.user.email,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions")
			res.statusCode.must.equal(200)
			res.body.must.not.include(initiative.uuid)
			res.body.must.not.include(t("SUBSCRIPTIONS_ALL_INITIATIVES"))

			var el = parseDom(res.body).querySelectorAll("li.subscription")
			el.length.must.equal(0)
		})
	})

	describe("PUT /subscriptions", function() {
		require("root/test/time")()

		require("root/test/fixtures").user({
			email: "user@example.com",
			email_confirmed_at: new Date
		})

		require("root/test/fixtures").csrf()

		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)
		})

		it("must update subscriptions to initiatives", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {
					"null[event_interest]": !subscription.event_interest,
					"null[comment_interest]": !subscription.comment_interest
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date,
				event_interest: !subscription.event_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must update subscription to initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var uuid = initiative.uuid
			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {
					[uuid + "[event_interest]"]: !subscription.event_interest,
					[uuid + "[comment_interest]"]: !subscription.comment_interest
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date,
				event_interest: !subscription.event_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must update subscription to external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var uuid = initiative.uuid
			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {
					[uuid + "[event_interest]"]: !subscription.event_interest,
					[uuid + "[comment_interest]"]: !subscription.comment_interest
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date,
				event_interest: !subscription.event_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must not update unconfirmed subscription to initiative", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var other = yield subscriptionsDb.create(new ValidSubscription({
				email: subscription.email,
				initiative_uuid: initiative.uuid
			}))

			var uuid = initiative.uuid
			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {[uuid + "[official_interest]"]: !subscription.official_interest}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription, other])
		})

		it("must not update subscription to initiative by other emails",
			function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var other = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var uuid = initiative.uuid
			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {[uuid + "[official_interest]"]: !subscription.official_interest}
			})

			res.statusCode.must.equal(303)
				res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription, other])
		})

		it("must not update email", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {"null[email]": "root@example.com"}
			})

			res.statusCode.must.equal(303)

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date
			})
		})

		it("must delete subscription to initiatives", function*() {
			yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {"null[delete]": true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must delete subscription to initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {[subscription.initiative_uuid + "[delete]"]: true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must delete subscription to external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {[subscription.initiative_uuid + "[delete]"]: true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must not delete unconfirmed subscription to initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var other = yield subscriptionsDb.create(new ValidSubscription({
				email: subscription.email
			}))

			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {"null[delete]": true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription, other])
		})

		it("must not delete other subscriptions of the same email", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var otherInitiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var others = yield subscriptionsDb.create([
				new ValidSubscription({
					email: subscription.email,
					confirmed_at: new Date
				}),

				new ValidSubscription({
					email: subscription.email,
					initiative_uuid: otherInitiative.uuid,
					confirmed_at: new Date
				})
			])

			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {[subscription.initiative_uuid + "[delete]"]: true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql(others)
		})

		it("must not delete other subscriptions on the same initiative",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var others = yield subscriptionsDb.create([
				new ValidSubscription({confirmed_at: new Date}),

				new ValidSubscription({
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date
				})
			])

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {[subscription.initiative_uuid + "[delete]"]: true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql(others)
		})

		it("must not update subscriptions if user email unconfirmed", function*() {
			yield usersDb.update(this.user, {
				email: null,
				email_confirmed_at: null
			})

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions", {
				method: "PUT",
				form: {
					"null[event_interest]": !subscription.event_interest,
					"null[comment_interest]": !subscription.comment_interest
				}
			})

			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Email Unconfirmed")
			yield subscriptionsDb.read(subscription).must.then.eql(subscription)
		})
	})

	describe("DELETE /subscriptions", function() {
		require("root/test/time")()

		require("root/test/fixtures").user({
			email: "user@example.com",
			email_confirmed_at: new Date
		})

		require("root/test/fixtures").csrf()

		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)
		})

		it("must delete subscriptions for a given email address", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				confirmed_at: new Date
			}))

			var initiatives = yield _.times(3, () => initiativesDb.create(
				new ValidInitiative({phase: "parliament", external: true})
			))

			yield subscriptionsDb.create(initiatives.map((i) => (
				new ValidSubscription({
					email: subscription.email,
					initiative_uuid: i.uuid,
					confirmed_at: new Date
				})
			)))

			var res = yield this.request("/user/subscriptions", {method: "DELETE"})
			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must not delete unconfirmed subscriptions", function*() {
			var initiatives = yield initiativesDb.create(_.times(2, () => (
				new ValidInitiative({phase: "parliament", external: true})
			)))

			var unconfirmed = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				initiative_uuid: initiatives[0].uuid
			}))

			yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				initiative_uuid: initiatives[1].uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions", {method: "DELETE"})
			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([unconfirmed])
		})

		it("must not delete subscriptions by other emails", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscriptions = yield subscriptionsDb.create([
				new ValidSubscription({
					confirmed_at: new Date
				}),

				new ValidSubscription({
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date
				})
			])

			yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions", {method: "DELETE"})
			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/user/subscriptions")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql(subscriptions)
		})

		it("must not delete subscriptions if user email unconfirmed",
			function*() {
			yield usersDb.update(this.user, {
				email: null,
				email_confirmed_at: null
			})

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: this.user.email,
				confirmed_at: new Date
			}))

			var res = yield this.request("/user/subscriptions", {method: "DELETE"})
			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Email Unconfirmed")
			yield subscriptionsDb.read(subscription).must.then.eql(subscription)
		})
	})

	describe("GET /email", function() {
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

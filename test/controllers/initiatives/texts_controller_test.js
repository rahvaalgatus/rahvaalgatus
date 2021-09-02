var _ = require("root/lib/underscore")
var Url = require("url")
var Ocsp = require("undersign/lib/ocsp")
var Config = require("root/config")
var Crypto = require("crypto")
var ValidUser = require("root/test/valid_user")
var ValidCoauthor = require("root/test/valid_initiative_coauthor")
var ValidInitiative = require("root/test/valid_initiative")
var ValidText = require("root/test/valid_initiative_text")
var ValidTextSignature = require("root/test/valid_initiative_text_signature")
var MediaType = require("medium-type")
var Certificate = require("undersign/lib/certificate")
var textsDb = require("root/db/initiative_texts_db")
var usersDb = require("root/db/users_db")
var coauthorsDb = require("root/db/initiative_coauthors_db")
var initiativesDb = require("root/db/initiatives_db")
var textSignaturesDb = require("root/db/initiative_text_signatures_db")
var sql = require("sqlate")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var newCertificate = require("root/test/fixtures").newCertificate
var newOcspResponse = require("root/test/fixtures").newOcspResponse
var t = require("root/lib/i18n").t.bind(null, "et")
var parseCookies = require("root/lib/http").parseCookies
var TRIX_TYPE = new MediaType("application/vnd.basecamp.trix+json")
var {renderForSigning} =
	require("root/controllers/initiatives/texts_controller")
var {newTrixDocument} = require("root/test/fixtures")
var next = require("co-next")
var respond = require("root/test/fixtures").respond
var outdent = require("root/lib/outdent")
var parseDom = require("root/lib/dom").parse
var hades = require("root").hades
var PERSONAL_ID = "38706181337"
var MOBILE_ID_URL = Url.parse("https://mid.sk.ee/mid-api/")
var SMART_ID_URL = Url.parse("https://rp-api.smart-id.com/v1/")
var VALID_ISSUERS = require("root/test/fixtures").VALID_ISSUERS
var TIMEMARK_URL = Url.parse(Config.timemarkUrl)
var JOHN_RSA_KEYS = require("root/test/fixtures").JOHN_RSA_KEYS
var SMART_ID = "PNOEE-" + PERSONAL_ID + "-R2D2-Q"
var CERTIFICATE_TYPE = "application/pkix-cert"
var ERR_TYPE = "application/vnd.rahvaalgatus.error+json"
var SIGNABLE_TYPE = "application/vnd.rahvaalgatus.signable"
var SIGNATURE_TYPE = "application/vnd.rahvaalgatus.signature"

var ID_CARD_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationName: "ESTEID",
		organizationalUnitName: "digital signature",
		commonName: `SMITH,JOHN,${PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: `PNOEE-${PERSONAL_ID}`
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var MOBILE_ID_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationName: "ESTEID (MOBIIL-ID)",
		organizationalUnitName: "digital signature",
		commonName: `SMITH,JOHN,${PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: `PNOEE-${PERSONAL_ID}`
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var SMART_ID_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationalUnitName: "SIGNATURE",
		commonName: `SMITH,JOHN,PNOEE-${PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: `PNOEE-${PERSONAL_ID}`
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

describe("InitiativeTextsController", function() {
	require("root/test/web")()
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/fixtures").csrf()

	describe("POST /", function() {
		describe("when not logged in", function() {
			it("must respond with 401 if not published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]"}
				})

				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it("must respond with 401 if published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]"}
				})

				res.statusCode.must.equal(401)
			res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not the author", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]"}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})

			it("must respond with 403 if no longer in edit or sign phase",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "parliament"
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]"}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.must.equal("Not Editable")
			})

			it("must respond with 405 if in sign phase given no language",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]"}
				})

				res.statusCode.must.equal(405)
				res.statusMessage.must.must.equal("Can Only Add Translations")
			})

			it("must respond with 405 if in sign phase given initiative's language",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					language: "en"
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]", language: "en"}
				})

				res.statusCode.must.equal(405)
				res.statusMessage.must.must.equal("Can Only Add Translations")
			})

			it("must create new text and set title", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					language: "en"
				}))

				var content = newTrixDocument("Hello, world")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Let it shine",
						content: JSON.stringify(content),
						language: "en"
					}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

				yield initiativesDb.read(initiative).must.then.eql({
					__proto__: initiative,
					title: "Let it shine"
				})

				yield textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.then.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Let it shine",
					language: "en",
					content: content,
					content_type: TRIX_TYPE
				})])

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_TEXT_CREATED"))
			})

			it("must create new text and set title even if content empty", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					language: "en"
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					// With JavaScript disabled, content is left empty entirely when
					// creating.
					form: {title: "Let it shine", content: "", language: "en"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

				yield initiativesDb.read(initiative).must.then.eql({
					__proto__: initiative,
					title: "Let it shine"
				})

				yield textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.then.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Let it shine",
					language: "en",
					content: [],
					content_type: TRIX_TYPE
				})])
			})

			it("must create new text given translation in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var content = newTrixDocument("Hello, world")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Let it shine",
						content: JSON.stringify(content),
						language: "en"
					}
				})

				res.statusCode.must.equal(302)

				yield initiativesDb.read(initiative).must.then.eql(initiative)

				yield textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.then.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Let it shine",
					language: "en",
					content: content,
					content_type: TRIX_TYPE
				})])
			})

			it("must create new text given translation in sign phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var content = newTrixDocument("Hello, world")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Let it shine",
						content: JSON.stringify(content),
						language: "en"
					}
				})

				res.statusCode.must.equal(302)

				yield initiativesDb.read(initiative).must.then.eql(initiative)

				yield textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.then.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Let it shine",
					language: "en",
					content: content,
					content_type: TRIX_TYPE
				})])
			})

			it("must create new text if coauthor", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative_uuid: initiative.uuid,
					user: this.user,
					status: "accepted"
				}))

				var content = newTrixDocument("How are you?")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",

					form: {
						title: initiative.title,
						content: JSON.stringify(content),
						language: "et"
					}
				})

				res.statusCode.must.equal(302)

				yield textsDb.read(sql`
					SELECT * FROM initiative_texts LIMIT 1
				`).must.then.eql(new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: initiative.title,
					content: content,
					content_type: TRIX_TYPE
				}))
			})

			it("must create new text given basis", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var basis = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id
				}))

				var content = newTrixDocument("How are you?")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",

					form: {
						"basis-id": basis.id,
						title: initiative.title,
						content: JSON.stringify(content),
						language: basis.language
					}
				})

				res.statusCode.must.equal(302)

				yield textsDb.read(sql`
					SELECT * FROM initiative_texts WHERE id = 2
				`).must.then.eql(new ValidText({
					id: 2,
					basis_id: basis.id,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: initiative.title,
					content: content,
					content_type: TRIX_TYPE
				}))
			})

			it("must ignore basis if from another initiative", function*() {
				var other = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var basis = yield textsDb.create(new ValidText({
					initiative_uuid: other.uuid,
					user_id: this.user.id,
					title: other.title
				}))

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						"basis-id": basis.id,
						language: basis.language,
						title: initiative.title,
						content: "[]"
					}
				})

				res.statusCode.must.equal(302)

				yield textsDb.read(sql`
					SELECT * FROM initiative_texts WHERE id = 2
				`).must.then.eql(new ValidText({
					id: 2,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: initiative.title,
					content: [],
					content_type: TRIX_TYPE
				}))
			})

			// <form>s may send valueless <input>s as empty strings.
			it("must ignore basis if empty string", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {"basis-id": "", language: "et", content: "[]"}
				})

				res.statusCode.must.equal(302)
			})

			it("must create new text if initiative published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: new Date
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {language: "et", content: "[]"}
				})

				res.statusCode.must.equal(302)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_TEXT_CREATED_IF_PUBLISHED"))
			})
		})
	})

	describe("GET /new", function() {
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render page if no existing texts", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/new")
				res.statusCode.must.equal(200)
			})

			it("must render page if coauthor", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative_uuid: initiative.uuid,
					user: this.user,
					status: "accepted"
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/new")
				res.statusCode.must.equal(200)
			})
		})
	})

	describe("GET /:id", function() {
		describe("when not logged in", function() {
			it("must respond with 401 if not published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it("must respond with 401 if published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not the author", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})

			it("must respond with 403 if no longer in edit or sign phase",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "parliament"
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not Editable")
			})

			it("must render read-only warning if in sign phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(200)
				res.body.must.include(t("UPDATE_INITIATIVE_READONLY"))
			})

			it("must not render read-only warning on translation if in sign phase",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id,
					language: "en"
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("UPDATE_INITIATIVE_READONLY"))
			})

			it("must render if coauthor", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative_uuid: initiative.uuid,
					user: this.user,
					status: "accepted"
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(200)
			})

			describe("given CitizenOS HTML", function() {
				function forEachHeader(fn) { _.times(6, (i) => fn(`h${i + 1}`)) }

				// Initiative with id 1f821c9e-1b93-4ef5-947f-fe0be45855c5 has the main
				// title with <h2>, not <h1>.
				forEachHeader(function(tagName) {
					it(`must remove title from first <${tagName}>`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id
						}))

						var text = yield textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
							content_type: "application/vnd.citizenos.etherpad+html",
							content: outdent`
								<!DOCTYPE HTML>
								<html>
									<body>
										<${tagName}>Vote for Peace</${tagName}>
										<p>Rest in peace!</p>
									</body>
								</html>
							`
						}))

						var initiativePath = `/initiatives/${initiative.uuid}`
						var res = yield this.request(initiativePath + "/texts/" + text.id)
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var input = dom.querySelector("input[name=content]")

						JSON.parse(input.value).must.equal(outdent`
							<!DOCTYPE HTML>
							<html>
								<body><p>Rest in peace!</p></body>
							</html>
						`)
					})
				})

				it("must remove title from multiline <h1>", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<h1>
										Vote for Peace
									</h1>
									<p>Rest in peace!</p>
								</body>
							</html>
						`
					}))

					var initiativePath = `/initiatives/${initiative.uuid}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must remove single title given multiple <h1>", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<h1>Vote for Peace</h1>
									<h1>Vote for Terror</h1>
									<p>Rest in peace!</p>
								</body>
							</html>
						`
					}))

					var initiativePath = `/initiatives/${initiative.uuid}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><h1>Vote for Terror</h1>
							\t<p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must remove title given multiple empty and blank <h1>s",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<h1></h1>
									<h1> </h1>
									<h1>Vote for Peace</h1>
									<p>Rest in peace!</p>
								</body>
							</html>
						`
					}))

					var initiativePath = `/initiatives/${initiative.uuid}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must remove title given multiple empty and blank <h2>s",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<h2></h2>
									<h2> </h2>
									<h2>Vote for Peace</h2>
									<p>Rest in peace!</p>
								</body>
							</html>
						`
					}))

					var initiativePath = `/initiatives/${initiative.uuid}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must strip leading and trailing <br>s", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<br>
									<br>
									<h1>Vote for Peace</h1>
									<br>
									<br>
									<p>Rest in peace!</p>
									<br>
									<br>
								</body>
							</html>
						`
					}))

					var initiativePath = `/initiatives/${initiative.uuid}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				forEachHeader(function(tagName) {
					it(`must strip <br>s around <${tagName}>s`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id
						}))

						var text = yield textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
							content_type: "application/vnd.citizenos.etherpad+html",
							content: outdent`
								<!DOCTYPE HTML>
								<html>
									<body>
										<h1>Vote for Peace</h1>
										<p>Indeed</p>
										<br>
										<br>
										<${tagName}>Reasons</${tagName}>
										<br>
										<br>
										<p>Because.</p>
									</body>
								</html>
							`
						}))

						var initiativePath = `/initiatives/${initiative.uuid}`
						var res = yield this.request(initiativePath + "/texts/" + text.id)
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var input = dom.querySelector("input[name=content]")

						JSON.parse(input.value).must.equal(outdent`
							<!DOCTYPE HTML>
							<html>
								<body><p>Indeed</p>
									<${tagName}>Reasons</${tagName}>
									<p>Because.</p></body>
							</html>
						`)
					})
				})
			})
		})
	})

	describe("GET /:id/sign", function() {
		require("root/test/fixtures").user()

		it("must render signing page", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.user.id
			}))

			var text = yield textsDb.create(new ValidText({
				initiative_uuid: initiative.uuid,
				user_id: this.user.id
			}))

			var initiativePath = "/initiatives/" + initiative.uuid
			var res = yield this.request(`${initiativePath}/texts/${text.id}/sign`)
			res.statusCode.must.equal(200)
		})

		it("must render signing page if coauthor", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: (yield usersDb.create(new ValidUser)).id
			}))

			yield coauthorsDb.create(new ValidCoauthor({
				initiative_uuid: initiative.uuid,
				user: this.user,
				status: "accepted"
			}))

			var text = yield textsDb.create(new ValidText({
				initiative_uuid: initiative.uuid,
				user_id: initiative.user_id
			}))

			var initiativePath = "/initiatives/" + initiative.uuid
			var res = yield this.request(`${initiativePath}/texts/${text.id}/sign`)
			res.statusCode.must.equal(200)
		})
	})

	describe("POST /:id/signatures", function() {
		require("root/test/mitm")()
		require("root/test/fixtures").user()
		require("root/test/fixtures").csrf()
		beforeEach(require("root/test/mitm").router)

		beforeEach(function*() {
			this.user = yield usersDb.update(this.user, {personal_id: PERSONAL_ID})
		})

		function mustSign(sign) {
			describe("as signable", function() {
				it("must respond with 403 given another personal id", function*() {
					yield usersDb.update(this.user, {personal_id: "38706186666"})

					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						language: "en"
					}))

					var signed = yield sign(this.router, this.request, text)
					signed.statusCode.must.equal(422)
					signed.headers["content-type"].must.equal(ERR_TYPE)

					signed.body.must.eql({
						code: 422,
						name: "HttpError",
						description: t("INITIATIVE_TEXT_SIGNER_NOT_AUTHOR"),
						message: "Not Initiative Author"
					})
				})

				it("must start signing if coauthor", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative_uuid: initiative.uuid,
						user: this.user,
						status: "accepted"
					}))

					var text = yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: initiative.user_id,
						language: "en"
					}))

					var signed = yield sign(this.router, this.request, text)
					signed.statusCode.must.equal(202)
				})
			})
		}

		describe("when signing via Id-Card", function() {
			mustSign(function(_router, request, text) {
				var initiativePath = "/initiatives/" + text.initiative_uuid
				var textPath = `${initiativePath}/texts/${text.id}`

				return request(`${textPath}/signatures`, {
					method: "POST",
					headers: {
						Accept: `${SIGNABLE_TYPE}, ${ERR_TYPE}`,
						"Content-Type": CERTIFICATE_TYPE
					},
					body: ID_CARD_CERTIFICATE.toBuffer()
				})
			})

			it("must create a signature", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					language: "en"
				}))

				var cert = ID_CARD_CERTIFICATE
				var xades = newXades(text, cert)
				var signed = yield signWithIdCard(this.router, this.request, text, cert)
				signed.statusCode.must.equal(204)

				var initiativePath = "/initiatives/" + initiative.uuid
				signed.headers.location.must.equal(initiativePath + "?language=en")

				var signatures = yield textSignaturesDb.search(sql`
					SELECT * FROM initiative_text_signatures
				`)

				signatures.must.eql([new ValidTextSignature({
					id: 1,
					text_id: text.id,
					country: "EE",
					personal_id: PERSONAL_ID,
					method: "id-card",
					xades: signatures[0].xades,
					signable: renderForSigning(text),
					signable_type: new MediaType("text/html"),
					signed: true,
					timestamped: true
				})])

				signatures[0].xades.toString().must.equal(String(xades))
			})
		})

		describe("when signing via Mobile-Id", function() {
			mustSign(function(router, request, text) {
				return signWithMobileId(router, request, text, MOBILE_ID_CERTIFICATE)
			})

			it("must create a signature", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					language: "en"
				}))

				var cert = MOBILE_ID_CERTIFICATE
				var xades = newXades(text, cert)

				var signed = yield signWithMobileId(
					this.router,
					this.request,
					text,
					cert
				)

				var initiativePath = `/initiatives/${initiative.uuid}?language=en`
				signed.statusCode.must.equal(202)
				signed.headers["content-type"].must.equal("application/json")
				signed.body.must.eql({code: "OK", location: initiativePath})

				var signatures = yield textSignaturesDb.search(sql`
					SELECT * FROM initiative_text_signatures
				`)

				signatures.must.eql([new ValidTextSignature({
					id: 1,
					text_id: text.id,
					country: "EE",
					personal_id: PERSONAL_ID,
					method: "mobile-id",
					xades: signatures[0].xades,
					signable: renderForSigning(text),
					signable_type: new MediaType("text/html"),
					signed: true,
					timestamped: true
				})])

				signatures[0].xades.toString().must.equal(String(xades))
			})
		})

		describe("when signing via Smart-Id", function() {
			mustSign(function(router, request, text) {
				return signWithSmartId(router, request, text, SMART_ID_CERTIFICATE)
			})

			it("must create a signature", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					language: "en"
				}))

				var cert = SMART_ID_CERTIFICATE
				var xades = newXades(text, cert)

				var signed = yield signWithSmartId(
					this.router,
					this.request,
					text,
					cert
				)

				var initiativePath = `/initiatives/${initiative.uuid}?language=en`
				signed.statusCode.must.equal(202)
				signed.headers["content-type"].must.equal("application/json")
				signed.body.must.eql({code: "OK", location: initiativePath})

				var signatures = yield textSignaturesDb.search(sql`
					SELECT * FROM initiative_text_signatures
				`)

				signatures.must.eql([new ValidTextSignature({
					id: 1,
					text_id: text.id,
					country: "EE",
					personal_id: PERSONAL_ID,
					method: "smart-id",
					xades: signatures[0].xades,
					signable: renderForSigning(text),
					signable_type: new MediaType("text/html"),
					signed: true,
					timestamped: true
				})])

				signatures[0].xades.toString().must.equal(String(xades))
			})
		})
	})
})

function* signWithIdCard(router, request, text, cert) {
	var initiativePath = "/initiatives/" + text.initiative_uuid
	var textPath = `${initiativePath}/texts/${text.id}`
	var signing = yield request(`${textPath}/signatures`, {
		method: "POST",

		headers: {
			Accept: `${SIGNABLE_TYPE}, ${ERR_TYPE}`,
			"Content-Type": CERTIFICATE_TYPE
		},

		body: cert.toBuffer()
	})

	signing.statusCode.must.equal(202)

	var xades = yield textSignaturesDb.read(sql`
		SELECT * FROM initiative_text_signatures ORDER BY created_at DESC LIMIT 1
	`).then((row) => row.xades)

	router.post(TIMEMARK_URL.path, function(req, res) {
		req.headers.host.must.equal(TIMEMARK_URL.host)
		res.setHeader("Content-Type", "application/ocsp-response")
		res.end(Ocsp.parse(newOcspResponse(cert)).toBuffer())
	})

	return request(signing.headers.location, {
		method: "PUT",
		headers: {
			Accept: `application/x-empty, ${ERR_TYPE}`,
			"Content-Type": SIGNATURE_TYPE
		},

		body: signWithRsa(JOHN_RSA_KEYS.privateKey, xades.signable)
	})
}

function signWithMobileId(router, request, text, cert) {
	router.post(`${MOBILE_ID_URL.path}certificate`, function(req, res) {
		respond({result: "OK", cert: cert.toString("base64")}, req, res)
	})

	router.post(`${MOBILE_ID_URL.path}signature`, function(req, res) {
		respond({sessionID: "7c8bdd56-6772-4264-ba27-bf7a9ef72a11"}, req, res)
	})

	router.get(
		`${MOBILE_ID_URL.path}signature/session/:token`,
		next(function*(req, res) {
			res.writeHead(200)

			var xades = yield textSignaturesDb.read(sql`
				SELECT xades FROM initiative_text_signatures
				ORDER BY created_at DESC LIMIT 1
			`).then((row) => row.xades)

			respond({
				state: "COMPLETE",
				result: "OK",

				signature: {
					algorithm: "sha256WithRSAEncryption",
					value: signWithRsa(
						JOHN_RSA_KEYS.privateKey,
						xades.signable
					).toString("base64")
				}
			}, req, res)
		})
	)

	router.post(TIMEMARK_URL.path, function(req, res) {
		req.headers.host.must.equal(TIMEMARK_URL.host)
		res.setHeader("Content-Type", "application/ocsp-response")
		res.end(Ocsp.parse(newOcspResponse(cert)).toBuffer())
	})

	var initiativePath = "/initiatives/" + text.initiative_uuid
	var textPath = `${initiativePath}/texts/${text.id}`
	return request(`${textPath}/signatures`, {
		method: "POST",
		headers: {Accept: `application/json, ${ERR_TYPE}`},

		json: {
			method: "mobile-id",
			personalId: PERSONAL_ID,
			phoneNumber: "+37200000766"
		}
	})
}

function signWithSmartId(router, request, text, cert) {
	var certSession = "3befb011-37bf-4e57-b041-e4cba1496766"
	var signSession = "21e55f06-d6cb-40b7-9638-75dc0b131851"

	router.post(
		`${SMART_ID_URL.path}certificatechoice/etsi/:id`,
		respond.bind(null, {sessionID: certSession})
	)

	router.get(
		`${SMART_ID_URL.path}session/${certSession}`,
		typeof cert == "function" ? cert : respond.bind(null, {
			state: "COMPLETE",
			result: {endResult: "OK", documentNumber: SMART_ID},
			cert: {certificateLevel: "QUALIFIED", value: cert.toString("base64")}
		})
	)

	router.post(
		`${SMART_ID_URL.path}signature/document/${SMART_ID}`,
		respond.bind(null, {sessionID: signSession})
	)

	router.get(
		`${SMART_ID_URL.path}session/${signSession}`,
		next(function*(req, res) {
			res.writeHead(200)

			var xades = yield textSignaturesDb.read(sql`
				SELECT xades FROM initiative_text_signatures
				ORDER BY created_at DESC LIMIT 1
			`).then((row) => row.xades)

			respond({
				state: "COMPLETE",
				result: {endResult: "OK"},
				cert: {certificateLevel: "QUALIFIED", value: cert.toString("base64")},

				signature: {
					algorithm: "sha256WithRSAEncryption",
					value: signWithRsa(
						JOHN_RSA_KEYS.privateKey,
						xades.signable
					).toString("base64")
				}
			}, req, res)
		})
	)

	router.post(TIMEMARK_URL.path, function(req, res) {
		req.headers.host.must.equal(TIMEMARK_URL.host)
		res.setHeader("Content-Type", "application/ocsp-response")
		res.flushHeaders()

		// NOTE: Respond with a little delay to ensure signature
		// polling later works as expected.
		setTimeout(() => res.end(Ocsp.parse(newOcspResponse(cert)).toBuffer(), 10))
	})

	var initiativePath = "/initiatives/" + text.initiative_uuid
	var textPath = `${initiativePath}/texts/${text.id}`
	return request(`${textPath}/signatures`, {
		method: "POST",
		headers: {Accept: `application/json, ${ERR_TYPE}`},
		json: {method: "smart-id", personalId: PERSONAL_ID}
	})
}

function newXades(text, cert) {
	var xades = hades.new(cert, [{
		path: "translation.html",
		type: "text/html",
		hash: sha256(renderForSigning(text))
	}], {policy: "bdoc"})

	xades.setSignature(signWithRsa(
		JOHN_RSA_KEYS.privateKey,
		xades.signable
	))

	var ocspResponse = Ocsp.parse(newOcspResponse(cert))
	xades.setOcspResponse(ocspResponse)
	return xades
}

function signWithRsa(key, signable) {
	return Crypto.createSign("sha256").update(signable).sign(key)
}

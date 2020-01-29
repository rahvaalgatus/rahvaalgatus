var _ = require("root/lib/underscore")
var Url = require("url")
var Config = require("root/config")
var Crypto = require("crypto")
var Http = require("root/lib/http")
var ValidUser = require("root/test/valid_user")
var ValidAuthentication = require("root/test/valid_authentication")
var ValidSession = require("root/test/valid_session")
var Certificate = require("undersign/lib/certificate")
var DateFns = require("date-fns")
var X509Asn = require("undersign/lib/x509_asn")
var respond = require("root/test/fixtures").respond
var createUser = require("root/test/fixtures").createUser
var newCitizenUser = require("root/test/citizenos_fixtures").newUser
var createCitizenUser = require("root/test/citizenos_fixtures").createUser
var parseCookies = Http.parseCookies
var parseFlash = Http.parseFlash.bind(null, Config.cookieSecret)
var newCertificate = require("root/test/fixtures").newCertificate
var usersDb = require("root/db/users_db")
var authenticationsDb = require("root/db/authentications_db")
var sessionsDb = require("root/db/sessions_db")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var sql = require("sqlate")
var cosDb = require("root").cosDb
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var next = require("co-next")
var tsl = require("root").tsl
var SESSION_COOKIE_NAME = Config.sessionCookieName
var MOBILE_ID_URL = Url.parse("https://mid.sk.ee/mid-api/")
var SMART_ID_URL = Url.parse("https://rp-api.smart-id.com/v1/")
var ERR_TYPE = "application/vnd.rahvaalgatus.error+json"
var CERTIFICATE_TYPE = "application/pkix-cert"
var SIGNABLE_TYPE = "application/vnd.rahvaalgatus.signable"
var SIGNATURE_TYPE = "application/vnd.rahvaalgatus.signature"
var JOHN_ECDSA_KEYS = require("root/test/fixtures").JOHN_ECDSA_KEYS
var VALID_ISSUERS = require("root/test/fixtures").VALID_ISSUERS
var JOHN_RSA_KEYS = require("root/test/fixtures").JOHN_RSA_KEYS
var {PHONE_NUMBER_TRANSFORMS} = require("root/test/fixtures")
var {MOBILE_ID_CREATE_ERRORS} = require("root/test/fixtures")
var {MOBILE_ID_SESSION_ERRORS} = require("root/test/fixtures")
var PERSONAL_ID = "60001019906"
var SESSION_ID = "7c8bdd56-6772-4264-ba27-bf7a9ef72a11"

var ID_CARD_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationName: "ESTEID",
		organizationalUnitName: "authentication",
		commonName: `SMITH,JOHN,${PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: PERSONAL_ID
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var MOBILE_ID_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationName: "ESTEID (MOBIIL-ID)",
		organizationalUnitName: "authentication",
		commonName: `SMITH,JOHN,${PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: PERSONAL_ID
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var SMART_ID_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationalUnitName: "AUTHENTICATION",
		commonName: `SMITH,JOHN,PNOEE-${PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: `PNOEE-${PERSONAL_ID}`
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var SMART_ID_SESSION_ERRORS = {
	USER_REFUSED: [
		410,
		"Smart-Id Cancelled",
		"SMART_ID_ERROR_USER_REFUSED_AUTH"
	],

	TIMEOUT: [
		410,
		"Smart-Id Timeout",
		"SMART_ID_ERROR_TIMEOUT_AUTH"
	],

	DOCUMENT_UNUSABLE: [
		410,
		"Smart-Id Certificate Unusable",
		"SMART_ID_ERROR_DOCUMENT_UNUSABLE"
	],

	WRONG_VC: [
		410,
		"Wrong Smart-Id Verification Code Chosen",
		"SMART_ID_ERROR_WRONG_VERIFICATION_CODE"
	]
}

describe("SessionsController", function() {
	require("root/test/db")()
	require("root/test/web")()
	require("root/test/mitm")()
	beforeEach(require("root/test/mitm").router)

	describe("GET /new", function() {
		describe("when not logged in", function() {
			it("must render signin page", function*() {
				var res = yield this.request("/sessions/new")
				res.statusCode.must.equal(200)
				res.body.must.include(t("SIGNIN_PAGE_TITLE"))
			})

			// This was a bug noticed on Mar 24, 2017 with initiative signing where
			// the UI translation strings were not rendered on the page. They were
			// used only for ID-card errors.
			it("must render UI strings when voting", function*() {
				var res = yield this.request("/sessions/new")
				res.statusCode.must.equal(200)
				res.body.must.include("MSG_ERROR_HWCRYPTO_NO_CERTIFICATES")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must redirect to user page", function*() {
				var res = yield this.request("/sessions/new")
				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/user")
			})

			it("must redirect back to referrer", function*() {
				var res = yield this.request("/sessions/new", {
					headers: {Referer: this.url + "/initiatives"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(this.url + "/initiatives")
			})

			it("must not redirect back to other hosts", function*() {
				var res = yield this.request("/sessions/new", {
					Referer: "http://example.com/evil"
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/user")
			})
		})
	})

	describe("GET /", function() {
		describe("when not logged in", function() {
			it("must redirect to /sessions/new", function*() {
				var res = yield this.request("/sessions")
				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/sessions/new")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must redirect to /user", function*() {
				var res = yield this.request("/sessions")
				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/user")
			})
		})
	})

	describe("POST /", function() {
		require("root/test/fixtures").csrfRequest()
		require("root/test/time")()

		function mustSignIn(signIn, cert) {
			describe("as sign-in-able", function() {
				it("must set session cookie", function*() {
					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.equal(204)

					var cookies = parseCookies(res.headers["set-cookie"])
					cookies.session_token.path.must.equal("/")
					cookies.session_token.domain.must.equal(Config.cookieDomain)
					cookies.session_token.httpOnly.must.be.true()

					var cookieToken = Buffer.from(cookies.session_token.value, "hex")
					var session = yield sessionsDb.read(sql`SELECT * FROM sessions`)
					session.token_sha256.must.eql(sha256(cookieToken))
				})

				it("must redirect back to user profile", function*() {
					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.equal(204)
					res.headers.location.must.equal("/user")
				})

				it("must redirect back to user profile if on signin page", function*() {
					var res = yield signIn(this.router, this.request, cert, {
						Referer: this.url + "/sessions/new"
					})

					res.statusCode.must.equal(204)
					res.headers.location.must.equal("/user")
				})

				it("must redirect back to referrer", function*() {
					var res = yield signIn(this.router, this.request, cert, {
						Referer: this.url + "/initiatives"
					})

					res.statusCode.must.equal(204)
					res.headers.location.must.equal(this.url + "/initiatives")
				})

				it("must not redirect to other hosts", function*() {
					var res = yield signIn(this.router, this.request, cert, {
						Referer: "http://example.com/evil"
					})

					res.statusCode.must.equal(204)
					res.headers.location.must.equal("/user")
				})

				it("must reset the CSRF token", function*() {
					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.equal(204)

					var cookies = parseCookies(res.headers["set-cookie"])
					cookies.csrf_token.value.must.not.equal(this.csrfToken)
				})

				it("must store IP address and user-agent", function*() {
					var res = yield signIn(this.router, this.request, cert, {
						"User-Agent": "Mozilla"
					})

					res.statusCode.must.equal(204)
					res.headers.location.must.equal("/user")

					var session = yield sessionsDb.read(sql`SELECT * FROM sessions`)
					session.created_ip.must.equal("127.0.0.1")
					session.created_user_agent.must.equal("Mozilla")
				})

				it("must create user in Citizen database", function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: PERSONAL_ID
						},

						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.equal(204)

					var user = yield usersDb.read(sql`SELECT * FROM users`)
					user.country.must.equal("EE")
					user.personal_id.must.equal(PERSONAL_ID)

					var cosUsers = yield cosDb.query(sql`
						SELECT * FROM "Users"
					`)

					cosUsers.length.must.equal(1)
					cosUsers[0].id.must.equal(_.serializeUuid(user.uuid))
					cosUsers[0].language.must.equal(Config.language)
					cosUsers[0].source.must.equal("citizenos")

					var cosConnections = yield cosDb.query(sql`
						SELECT * FROM "UserConnections"
					`)

					cosConnections.length.must.equal(1)
					cosConnections[0].userId.must.equal(cosUsers[0].id)
					cosConnections[0].connectionId.must.equal("esteid")
					cosConnections[0].connectionUserId.must.equal(PERSONAL_ID)
				})

				it("must create user from confirmed CitizenOS user", function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: PERSONAL_ID
						},

						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var cosUser = yield createCitizenUser(newCitizenUser({
						name: "Johnny Foursmith",
						email: "user@example.com",
						emailIsVerified: true,
						language: "ru"
					}))

					yield cosDb("UserConnections").insert({
						userId: cosUser.id,
						connectionId: "esteid",
						connectionUserId: PERSONAL_ID,
						createdAt: new Date,
						updatedAt: new Date
					})

					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.equal(204)

					var user = yield usersDb.read(sql`SELECT * FROM users`)

					user.must.eql(new ValidUser({
						id: user.id,
						uuid: _.parseUuid(cosUser.id),
						name: "Johnny Foursmith",
						official_name: "John Smith",
						personal_id: PERSONAL_ID,
						email: "user@example.com",
						email_confirmed_at: new Date(0),
						language: "et",
						created_at: cosUser.createdAt,
						updated_at: cosUser.updatedAt
					}))
				})

				it("must create user from unconfirmed CitizenOS user", function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: PERSONAL_ID
						},

						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var cosUser = yield createCitizenUser(newCitizenUser({
						email: "user@example.com",
						emailIsVerified: false
					}))

					yield cosDb("UserConnections").insert({
						userId: cosUser.id,
						connectionId: "esteid",
						connectionUserId: PERSONAL_ID,
						createdAt: new Date,
						updatedAt: new Date
					})

					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.equal(204)

					var user = yield usersDb.read(sql`SELECT * FROM users`)

					user.must.eql(new ValidUser({
						id: user.id,
						name: "John Smith",
						uuid: _.parseUuid(cosUser.id),
						personal_id: PERSONAL_ID,
						unconfirmed_email: "user@example.com",
						email_confirmation_token: user.email_confirmation_token,
						created_at: cosUser.createdAt,
						updated_at: cosUser.updatedAt
					}))
				})

				it("must not re-use other users", function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: PERSONAL_ID
						},

						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var cosUser = yield createCitizenUser(newCitizenUser())

					yield cosDb("UserConnections").insert({
						userId: cosUser.id,
						connectionId: "esteid",
						connectionUserId: "38706181337",
						createdAt: new Date,
						updatedAt: new Date
					})

					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.equal(204)

					var cosUsers = yield cosDb.query(sql`
						SELECT * FROM "Users"
					`)

					cosUsers.length.must.equal(2)
				})

				it("must create user with person's real name", function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: PERSONAL_ID
						},

						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var cosUser = yield createCitizenUser(newCitizenUser({
						name: "Johnny Foursmith"
					}))

					yield cosDb("UserConnections").insert({
						userId: cosUser.id,
						connectionId: "esteid",
						connectionUserId: PERSONAL_ID,
						createdAt: new Date,
						updatedAt: new Date
					})

					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.equal(204)

					var user = yield usersDb.read(sql`SELECT * FROM users`)
					user.name.must.equal("Johnny Foursmith")
					user.official_name.must.equal("John Smith")
				})

				it("must create a session given a PNO certificate", function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.equal(204)

					var user = yield usersDb.read(sql`SELECT * FROM users`)
					user.country.must.equal("EE")
					user.personal_id.must.equal(PERSONAL_ID)

					yield sessionsDb.search(sql`
						SELECT * FROM sessions
					`).must.then.not.be.empty()
				})

				VALID_ISSUERS.forEach(function(issuer) {
					var issuerName = _.merge({}, ...issuer.subject).commonName

					it(`must create session given certificate issued by ${issuerName}`,
						function*() {
						var cert = new Certificate(newCertificate({
							subject: {
								countryName: "EE",
								organizationName: "ESTEID",
								organizationalUnitName: "authentication",
								commonName: `SMITH,JOHN,${PERSONAL_ID}`,
								surname: "SMITH",
								givenName: "JOHN",
								serialNumber: PERSONAL_ID
							},

							issuer: issuer,
							publicKey: JOHN_RSA_KEYS.publicKey
						}))

						var res = yield signIn(this.router, this.request, cert)
						res.statusCode.must.equal(204)

						yield usersDb.search(sql`
							SELECT * FROM users
						`).must.then.not.be.empty()

						yield sessionsDb.search(sql`
							SELECT * FROM sessions
						`).must.then.not.be.empty()
					})
				})
			})
		}

		describe("when authenticating via Id-Card", function() {
			mustSignIn(signInWithIdCard, ID_CARD_CERTIFICATE)

			it("must create user and session", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID",
						organizationalUnitName: "authentication",
						commonName: "SMITH,JOHN,60001019906",
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: "60001019906"
					},

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var authenticating = yield this.request("/sessions", {
					method: "POST",
					headers: {Accept: SIGNABLE_TYPE, "Content-Type": CERTIFICATE_TYPE},
					body: cert.toBuffer()
				})

				authenticating.statusCode.must.equal(202)
				authenticating.headers["content-type"].must.equal(SIGNABLE_TYPE)

				var authentication = yield authenticationsDb.read(sql`
					SELECT * FROM authentications
				`)

				authenticating.body.must.eql(sha256(authentication.token))

				var location = authenticating.headers.location
				var authenticated = yield this.request(location, {
					method: "POST",

					headers: {
						Accept: `application/x-empty, ${ERR_TYPE}`,
						"Content-Type": SIGNATURE_TYPE
					},

					body: signWithRsa(JOHN_RSA_KEYS.privateKey, authentication.token)
				})

				authenticated.statusCode.must.equal(204)
				authenticated.headers.location.must.equal("/user")

				var cookies = parseCookies(authenticated.headers["set-cookie"])
				var sessionToken = Buffer.from(cookies.session_token.value, "hex")

				var authentications = yield authenticationsDb.search(sql`
					SELECT * FROM authentications
				`)

				authentications.must.eql([new ValidAuthentication({
					id: authentications[0].id,
					authenticated: true,
					country: "EE",
					personal_id: "60001019906",
					method: "id-card",
					certificate: authentications[0].certificate,
					created_ip: "127.0.0.1",
					created_at: authentications[0].created_at,
					updated_at: authentications[0].updated_at,
					token: authentications[0].token
				})])

				authentications[0].token.must.not.eql(sessionToken)

				var users = yield usersDb.search(sql`SELECT * FROM users`)

				users.must.eql([new ValidUser({
					id: users[0].id,
					uuid: users[0].uuid,
					country: "EE",
					personal_id: "60001019906",
					name: "John Smith",
					language: "et",
					created_at: users[0].created_at,
					updated_at: users[0].updated_at
				})])

				var sessions = yield sessionsDb.search(sql`SELECT * FROM sessions`)

				sessions.must.eql([new ValidSession({
					id: sessions[0].id,
					user_id: users[0].id,
					method: "id-card",
					token_sha256: sha256(sessionToken),
					created_ip: "127.0.0.1",
					authentication_id: authentications[0].id,
					created_at: sessions[0].created_at,
					updated_at: sessions[0].updated_at
				})])
			})

			it("must respond with 422 given certificate from untrusted issuer",
				function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID",
						organizationalUnitName: "authentication",
						commonName: `SMITH,JOHN,${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: PERSONAL_ID
					},

					issuer: tsl.getBySubjectName([
						"C=EE",
						"O=AS Sertifitseerimiskeskus",
						"OU=Sertifitseerimisteenused",
						"CN=EID-SK 2007",
					].join(",")),

					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						Accept: `${SIGNABLE_TYPE}, ${ERR_TYPE}`,
						"Content-Type": CERTIFICATE_TYPE
					},

					body: cert.toBuffer()
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Issuer")
				res.headers["content-type"].must.equal(ERR_TYPE)

				res.body.must.eql({
					code: 422,
					message: "Invalid Issuer",
					name: "HttpError",
					description: t("INVALID_CERTIFICATE_ISSUER")
				})
			})

			it("must respond with 422 given non-Estonian's certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID",
						organizationalUnitName: "authentication",
						commonName: `SMITH,JOHN,${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOLT-${PERSONAL_ID}`
					},

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						Accept: `${SIGNABLE_TYPE}, ${ERR_TYPE}`,
						"Content-Type": CERTIFICATE_TYPE
					},

					body: cert.toBuffer()
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Estonian Users Only")
				res.headers["content-type"].must.equal(ERR_TYPE)

				res.body.must.eql({
					code: 422,
					message: "Estonian Users Only",
					name: "HttpError"
				})
			})

			it("must respond with 422 given future certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID",
						organizationalUnitName: "authentication",
						commonName: `SMITH,JOHN,${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: PERSONAL_ID
					},

					validFrom: DateFns.addSeconds(new Date, 1),
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						Accept: `${SIGNABLE_TYPE}, ${ERR_TYPE}`,
						"Content-Type": CERTIFICATE_TYPE
					},

					body: cert.toBuffer()
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Not Yet Valid")
				res.headers["content-type"].must.equal(ERR_TYPE)

				res.body.must.eql({
					code: 422,
					message: "Certificate Not Yet Valid",
					name: "HttpError",
					description: t("CERTIFICATE_NOT_YET_VALID")
				})
			})

			it("must respond with 422 given past certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID",
						organizationalUnitName: "authentication",
						commonName: `SMITH,JOHN,${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: PERSONAL_ID
					},

					validUntil: new Date,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						Accept: `${SIGNABLE_TYPE}, ${ERR_TYPE}`,
						"Content-Type": CERTIFICATE_TYPE
					},

					body: cert.toBuffer()
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Expired")
				res.headers["content-type"].must.equal(ERR_TYPE)

				res.body.must.eql({
					code: 422,
					message: "Certificate Expired",
					name: "HttpError",
					description: t("CERTIFICATE_EXPIRED")
				})
			})

			_.each({
				RSA: [JOHN_RSA_KEYS, signWithRsa],
				ECDSA: [JOHN_ECDSA_KEYS, signWithEcdsa]
			}, function([keys, sign], algo) {
				it(`must create a session given an ${algo} signature`, function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: PERSONAL_ID
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var authenticating = yield this.request("/sessions", {
						method: "POST",
						headers: {Accept: SIGNABLE_TYPE, "Content-Type": CERTIFICATE_TYPE},
						body: cert.toBuffer()
					})

					authenticating.statusCode.must.equal(202)

					var authentication = yield authenticationsDb.read(sql`
						SELECT * FROM authentications
					`)

					var location = authenticating.headers.location
					var authenticated = yield this.request(location, {
						method: "POST",
						headers: {
							Accept: `application/x-empty, ${ERR_TYPE}`,
							"Content-Type": SIGNATURE_TYPE
						},
						body: sign(keys.privateKey, authentication.token)
					})

					authenticated.statusCode.must.equal(204)

					yield usersDb.search(sql`
						SELECT * FROM users
					`).must.then.not.be.empty()

					yield sessionsDb.search(sql`
						SELECT * FROM sessions
					`).must.then.not.be.empty()
				})

				it(`must respond with 409 given an invalid ${algo} signature`,
					function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: PERSONAL_ID
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var authenticating = yield this.request("/sessions", {
						method: "POST",
						headers: {Accept: SIGNABLE_TYPE, "Content-Type": CERTIFICATE_TYPE},
						body: cert.toBuffer()
					})

					authenticating.statusCode.must.equal(202)

					var res = yield this.request(authenticating.headers.location, {
						method: "POST",

						headers: {
							Accept: `application/x-empty, ${ERR_TYPE}`,
							"Content-Type": SIGNATURE_TYPE
						},

						body: Crypto.randomBytes(64)
					})

					res.statusCode.must.equal(409)
					res.statusMessage.must.equal("Invalid Signature")
					res.headers["content-type"].must.equal(ERR_TYPE)

					res.body.must.eql({
						code: 409,
						message: "Invalid Signature",
						name: "HttpError"
					})

					yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

					yield sessionsDb.search(sql`
						SELECT * FROM sessions
					`).must.then.be.empty()
				})
			})
		})

		describe("when authenticating via Mobile-Id", function() {
			mustSignIn(signInWithMobileId, MOBILE_ID_CERTIFICATE)

			it("must create user and session", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "authentication",
						commonName: "SMITH,JOHN,60001019906",
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: "60001019906"
					},

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					req.headers.host.must.equal(MOBILE_ID_URL.host)

					req.body.relyingPartyName.must.equal(Config.mobileIdUser)
					req.body.relyingPartyUUID.must.equal(Config.mobileIdPassword)
					req.body.phoneNumber.must.equal("+37200000766")
					req.body.nationalIdentityNumber.must.equal("60001019906")

					respond({result: "OK", cert: cert.toString("base64")}, req, res)
				})

				this.router.post(`${MOBILE_ID_URL.path}authentication`,
					next(function*(req, res) {
					res.writeHead(200)
					req.headers.host.must.equal(MOBILE_ID_URL.host)

					req.body.relyingPartyName.must.equal(Config.mobileIdUser)
					req.body.relyingPartyUUID.must.equal(Config.mobileIdPassword)
					req.body.phoneNumber.must.equal("+37200000766")
					req.body.nationalIdentityNumber.must.equal("60001019906")
					req.body.hashType.must.equal("SHA256")
					req.body.language.must.equal("EST")

					var token = yield authenticationsDb.read(sql`
						SELECT token FROM authentications
						ORDER BY created_at DESC
						LIMIT 1
					`).then((row) => row.token)

					Buffer.from(req.body.hash, "base64").must.eql(sha256(token))

					respond({sessionID: SESSION_ID}, req, res)
				}))

				this.router.get(`${MOBILE_ID_URL.path}authentication/session/:token`,
					next(function*(req, res) {
					res.writeHead(200)
					req.headers.host.must.equal(MOBILE_ID_URL.host)
					req.params.token.must.equal(SESSION_ID)

					var token = yield authenticationsDb.read(sql`
						SELECT token FROM authentications
						ORDER BY created_at DESC
						LIMIT 1
					`).then((row) => row.token)

					respond({
						result: "OK",
						state: "COMPLETE",
						cert: cert.toString("base64"),

						signature: {
							algorithm: "sha256WithRSAEncryption",
							value: signWithRsa(
								JOHN_RSA_KEYS.privateKey,
								token
							).toString("base64")
						}
					}, req, res)
				}))

				var authenticating = yield this.request("/sessions", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: "60001019906",
						phoneNumber: "+37200000766"
					}
				})

				authenticating.statusCode.must.equal(202)

				var location = authenticating.headers.location
				var authenticated = yield this.request(location, {
					method: "POST",
					headers: {Accept: `application/x-empty, ${ERR_TYPE}`},
					form: {method: "mobile-id"}
				})

				authenticated.statusCode.must.equal(204)
				authenticated.headers.location.must.equal("/user")

				var cookies = parseCookies(authenticated.headers["set-cookie"])
				var sessionToken = Buffer.from(cookies.session_token.value, "hex")

				var authentications = yield authenticationsDb.search(sql`
					SELECT * FROM authentications
				`)

				authentications.must.eql([new ValidAuthentication({
					id: authentications[0].id,
					authenticated: true,
					country: "EE",
					personal_id: "60001019906",
					method: "mobile-id",
					certificate: authentications[0].certificate,
					created_ip: "127.0.0.1",
					created_at: authentications[0].created_at,
					updated_at: authentications[0].updated_at,
					token: authentications[0].token
				})])

				authentications[0].token.must.not.eql(sessionToken)

				var users = yield usersDb.search(sql`SELECT * FROM users`)

				users.must.eql([new ValidUser({
					id: users[0].id,
					uuid: users[0].uuid,
					country: "EE",
					personal_id: "60001019906",
					name: "John Smith",
					language: "et",
					created_at: users[0].created_at,
					updated_at: users[0].updated_at
				})])

				var sessions = yield sessionsDb.search(sql`SELECT * FROM sessions`)

				sessions.must.eql([new ValidSession({
					id: sessions[0].id,
					user_id: users[0].id,
					method: "mobile-id",
					token_sha256: sha256(sessionToken),
					created_ip: "127.0.0.1",
					authentication_id: authentications[0].id,
					created_at: sessions[0].created_at,
					updated_at: sessions[0].updated_at
				})])
			})

			it("must respond with 422 given certificate from untrusted issuer",
				function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "authentication",
						commonName: `SMITH,JOHN,${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: PERSONAL_ID
					},

					issuer: tsl.getBySubjectName([
						"C=EE",
						"O=AS Sertifitseerimiskeskus",
						"OU=Sertifitseerimisteenused",
						"CN=EID-SK 2007",
					].join(",")),

					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					respond({result: "OK", cert: cert.toString("base64")}, req, res)
				})

				var res = yield this.request("/sessions", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Issuer")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("INVALID_CERTIFICATE_ISSUER"))
			})

			it("must respond with 422 given non-Estonian's certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "authentication",
						commonName: `SMITH,JOHN,${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOLT-${PERSONAL_ID}`
					},

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					respond({result: "OK", cert: cert.toString("base64")}, req, res)
				})

				var res = yield this.request("/sessions", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Estonian Users Only")
			})

			it("must respond with 422 given future certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "authentication",
						commonName: `SMITH,JOHN,${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: PERSONAL_ID
					},

					validFrom: DateFns.addSeconds(new Date, 1),
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					respond({result: "OK", cert: cert.toString("base64")}, req, res)
				})

				var res = yield this.request("/sessions", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Not Yet Valid")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("CERTIFICATE_NOT_YET_VALID"))
			})

			it("must respond with 422 given past certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "authentication",
						commonName: `SMITH,JOHN,${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: PERSONAL_ID
					},

					validUntil: new Date,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					respond({result: "OK", cert: cert.toString("base64")}, req, res)
				})

				var res = yield this.request("/sessions", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Expired")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("CERTIFICATE_EXPIRED"))
			})

			it("must create session if Mobile-Id session running", function*() {
				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					respond({
						result: "OK",
						cert: MOBILE_ID_CERTIFICATE.toString("base64")
					}, req, res)
				})

				this.router.post(
					`${MOBILE_ID_URL.path}authentication`,
					respond.bind(null, {sessionID: SESSION_ID})
				)

				var waited = 0
				this.router.get(`${MOBILE_ID_URL.path}authentication/session/:token`,
					next(function*(req, res) {
					if (waited++ < 2) return void respond({state: "RUNNING"}, req, res)
					res.writeHead(200)

					var token = yield authenticationsDb.read(sql`
						SELECT token FROM authentications
						ORDER BY created_at DESC
						LIMIT 1
					`).then((row) => row.token)

					respond({
						result: "OK",
						state: "COMPLETE",
						cert: MOBILE_ID_CERTIFICATE.toString("base64"),

						signature: {
							algorithm: "sha256WithRSAEncryption",
							value: signWithRsa(
								JOHN_RSA_KEYS.privateKey,
								token
							).toString("base64")
						}
					}, req, res)
				}))

				var authenticating = yield this.request("/sessions", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				authenticating.statusCode.must.equal(202)

				var location = authenticating.headers.location
				var authenticated = yield this.request(location, {
					method: "POST",
					headers: {Accept: `application/x-empty, ${ERR_TYPE}`},
					form: {method: "mobile-id"}
				})

				authenticated.statusCode.must.equal(204)

				yield usersDb.search(sql`
					SELECT * FROM users
				`).must.then.not.be.empty()

				yield sessionsDb.search(sql`
					SELECT * FROM sessions
				`).must.then.not.be.empty()
			})

			_.each({
				RSA: [JOHN_RSA_KEYS, signWithRsa],
				ECDSA: [JOHN_ECDSA_KEYS, signWithEcdsa]
			}, function([keys, sign], algo) {
				it(`must create a session given an ${algo} signature`, function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID (MOBIIL-ID)",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: PERSONAL_ID
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					this.router.post(`${MOBILE_ID_URL.path}certificate`,
						function(req, res) {
						respond({result: "OK", cert: cert.toString("base64")}, req, res)
					})

					this.router.post(
						`${MOBILE_ID_URL.path}authentication`,
						respond.bind(null, {sessionID: SESSION_ID})
					)

					this.router.get(`${MOBILE_ID_URL.path}authentication/session/:token`,
						next(function*(req, res) {
						res.writeHead(200)

						var token = yield authenticationsDb.read(sql`
							SELECT token FROM authentications
							ORDER BY created_at DESC
							LIMIT 1
						`).then((row) => row.token)

						respond({
							result: "OK",
							state: "COMPLETE",
							cert: cert.toString("base64"),

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: sign(keys.privateKey, token).toString("base64")
							}
						}, req, res)
					}))

					var authenticating = yield this.request("/sessions", {
						method: "POST",
						form: {
							method: "mobile-id",
							personalId: "60001019906",
							phoneNumber: "+37200000766"
						}
					})

					authenticating.statusCode.must.equal(202)

					var res = yield this.request(authenticating.headers.location, {
						method: "POST",
						headers: {Accept: `application/x-empty, ${ERR_TYPE}`},
						form: {method: "mobile-id"}
					})

					res.statusCode.must.equal(204)

					yield usersDb.search(sql`
						SELECT * FROM users
					`).must.then.not.be.empty()

					yield sessionsDb.search(sql`
						SELECT * FROM sessions
					`).must.then.not.be.empty()
				})

				it(`must respond with error given an invalid ${algo} signature`,
					function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID (MOBIIL-ID)",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: PERSONAL_ID
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					this.router.post(`${MOBILE_ID_URL.path}certificate`,
						function(req, res) {
						respond({result: "OK", cert: cert.toString("base64")}, req, res)
					})

					this.router.post(
						`${MOBILE_ID_URL.path}authentication`,
						respond.bind(null, {sessionID: SESSION_ID})
					)

					this.router.get(`${MOBILE_ID_URL.path}authentication/session/:token`,
						function(req, res) {
						respond({
							result: "OK",
							state: "COMPLETE",
							cert: cert.toString("base64"),

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: Crypto.randomBytes(64).toString("base64")
							}
						}, req, res)
					})

					var authenticating = yield this.request("/sessions", {
						method: "POST",
						form: {
							method: "mobile-id",
							personalId: "60001019906",
							phoneNumber: "+37200000766"
						}
					})

					authenticating.statusCode.must.equal(202)

					var errored = yield this.request(authenticating.headers.location, {
						method: "POST",
						headers: {Accept: `application/x-empty, ${ERR_TYPE}`},
						form: {method: "mobile-id"}
					})

					errored.statusCode.must.equal(410)
					errored.statusMessage.must.equal("Invalid Mobile-Id Signature")
					errored.headers.location.must.equal("/sessions/new")

					var cookies = Http.parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("MOBILE_ID_ERROR_INVALID_SIGNATURE"))

					var authentication = yield authenticationsDb.read(sql`
						SELECT * FROM authentications
					`)

					authentication.certificate.must.eql(cert)

					yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

					yield sessionsDb.search(sql`
						SELECT * FROM sessions
					`).must.then.be.empty()
				})
			})

			_.each(PHONE_NUMBER_TRANSFORMS, function(long, short) {
				it(`must transform mobile-id number ${short} to ${long}`,
					function*() {
					var created = 0
					this.router.post(`${MOBILE_ID_URL.path}certificate`, (req, res) => {
						++created
						req.body.phoneNumber.must.equal(long)
						req.body.nationalIdentityNumber.must.equal(PERSONAL_ID)
						respond({result: "NOT_FOUND"}, req, res)
					})

					var res = yield this.request("/sessions", {
						method: "POST",
						form: {
							method: "mobile-id",
							personalId: PERSONAL_ID,
							phoneNumber: short
						}
					})

					created.must.equal(1)
					res.statusCode.must.equal(422)

					res.statusMessage.must.equal(
						"Not a Mobile-Id User or Personal Id Mismatch"
					)

					res.body.must.include(t("MOBILE_ID_ERROR_NOT_FOUND"))

					yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

					yield sessionsDb.search(sql`
						SELECT * FROM sessions
					`).must.then.be.empty()
				})
			})

			_.each(MOBILE_ID_CREATE_ERRORS,
				function([statusCode, statusMessage, error], code) {
				it(`must respond with error given ${code}`, function*() {
					this.router.post(`${MOBILE_ID_URL.path}certificate`,
						function(req, res) {
						respond({result: code}, req, res)
					})

					var res = yield this.request("/sessions", {
						method: "POST",
						form: {
							method: "mobile-id",
							personalId: PERSONAL_ID,
							phoneNumber: "+37200000766"
						}
					})

					res.statusCode.must.equal(statusCode)
					res.statusMessage.must.equal(statusMessage)
					res.body.must.include(t(error))

					yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

					yield sessionsDb.search(sql`
						SELECT * FROM sessions
					`).must.then.be.empty()
				})
			})

			it("must respond with 422 given invalid personal id", function*() {
				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					res.statusCode = 400

					respond({
						error: "nationalIdentityNumber must contain of 11 digits"
					}, req, res)
				})

				var res = yield this.request("/sessions", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: "60001010",
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal(
					"Not a Mobile-Id User or Personal Id Mismatch"
				)

				res.body.must.include(t("MOBILE_ID_ERROR_NOT_FOUND"))

				yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

				yield sessionsDb.search(sql`
					SELECT * FROM sessions
				`).must.then.be.empty()
			})

			it("must respond with 422 given invalid phone number", function*() {
				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					res.statusCode = 400

					respond({
						error: "phoneNumber must contain of + and numbers(8-30)"
					}, req, res)
				})

				var res = yield this.request("/sessions", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: "60001010",
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal(
					"Not a Mobile-Id User or Personal Id Mismatch"
				)

				res.body.must.include(t("MOBILE_ID_ERROR_NOT_FOUND"))

				yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

				yield sessionsDb.search(sql`
					SELECT * FROM sessions
				`).must.then.be.empty()
			})

			it("must respond with 500 given Bad Request", function*() {
				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					res.statusCode = 400
					respond({error: "Unknown language 'FOOLANG"}, req, res)
				})

				var res = yield this.request("/sessions", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: "60001010",
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(500)
				res.statusMessage.must.equal("Unknown Mobile-Id Error")
				res.body.must.not.include("FOOLANG")

				yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

				yield sessionsDb.search(sql`
					SELECT * FROM sessions
				`).must.then.be.empty()
			})

			_.each(MOBILE_ID_SESSION_ERRORS,
				function([statusCode, statusMessage, error], code) {
				it(`must respond with error given ${code} while signing`, function*() {
					this.router.post(`${MOBILE_ID_URL.path}certificate`,
						function(req, res) {
						respond({
							result: "OK",
							cert: MOBILE_ID_CERTIFICATE.toString("base64")
						}, req, res)
					})

					this.router.post(
						`${MOBILE_ID_URL.path}authentication`,
						respond.bind(null, {sessionID: SESSION_ID})
					)

					this.router.get(`${MOBILE_ID_URL.path}authentication/session/:token`,
						function(req, res) {
						respond({state: "COMPLETE", result: code}, req, res)
					})

					var authenticating = yield this.request("/sessions", {
						method: "POST",
						form: {
							method: "mobile-id",
							personalId: PERSONAL_ID,
							phoneNumber: "+37200000766"
						}
					})

					authenticating.statusCode.must.equal(202)

					var errored = yield this.request(authenticating.headers.location, {
						method: "POST",
						headers: {Accept: `application/x-empty, ${ERR_TYPE}`},
						form: {method: "mobile-id"}
					})

					errored.statusCode.must.equal(statusCode)
					errored.statusMessage.must.equal(statusMessage)
					errored.headers.location.must.equal("/sessions/new")

					var cookies = Http.parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t(error))

					yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

					yield sessionsDb.search(sql`
						SELECT * FROM sessions
					`).must.then.be.empty()
				})
			})

			it("must time out after 2 minutes", function*() {
				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					respond({
						result: "OK",
						cert: MOBILE_ID_CERTIFICATE.toString("base64")
					}, req, res)
				})

				this.router.post(
					`${MOBILE_ID_URL.path}authentication`,
					respond.bind(null, {sessionID: SESSION_ID})
				)

				var waited = 0
				this.router.get(`${MOBILE_ID_URL.path}authentication/session/:token`,
					(req, res) => {
					Url.parse(req.url, true).query.timeoutMs.must.equal("30000")
					if (waited++ == 0) this.time.tick(119 * 1000)
					else this.time.tick(1000)
					respond({state: "RUNNING"}, req, res)
				})

				var authenticating = yield this.request("/sessions", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				authenticating.statusCode.must.equal(202)

				var errored = yield this.request(authenticating.headers.location, {
					method: "POST",
					headers: {Accept: `application/x-empty, ${ERR_TYPE}`},
					form: {method: "mobile-id"}
				})

				errored.statusCode.must.equal(410)
				errored.statusMessage.must.equal("Mobile-Id Timeout")
				errored.headers.location.must.equal("/sessions/new")
				waited.must.equal(2)

				var cookies = Http.parseCookies(errored.headers["set-cookie"])
				var res = yield this.request(errored.headers.location, {
					headers: {Cookie: Http.serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("MOBILE_ID_ERROR_TIMEOUT"))

				yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

				yield sessionsDb.search(sql`
					SELECT * FROM sessions
				`).must.then.be.empty()
			})
		})

		describe("when authenticating via Smart-Id", function() {
			mustSignIn(signInWithSmartId, SMART_ID_CERTIFICATE)
			
			it("must create user and session", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "AUTHENTICATION",
						commonName: "SMITH,JOHN,PNOEE-60001019906",
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: "PNOEE-60001019906"
					},

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var tokenHash

				this.router.post(
					`${SMART_ID_URL.path}authentication/etsi/PNOEE-60001019906`,
					function(req, res) {
					res.writeHead(200)
					req.headers.host.must.equal(SMART_ID_URL.host)

					req.body.relyingPartyName.must.equal(Config.smartIdUser)
					req.body.relyingPartyUUID.must.equal(Config.smartIdPassword)
					req.body.hashType.must.equal("SHA256")

					// The token hash has to be tested later when an authentication has
					// been created.
					tokenHash = Buffer.from(req.body.hash, "base64")

					respond({sessionID: SESSION_ID}, req, res)
				})

				this.router.get(`${SMART_ID_URL.path}session/:token`,
					next(function*(req, res) {
					res.writeHead(200)
					req.headers.host.must.equal(SMART_ID_URL.host)
					req.params.token.must.equal(SESSION_ID)

					var token = yield authenticationsDb.read(sql`
						SELECT token FROM authentications
						ORDER BY created_at DESC
						LIMIT 1
					`).then((row) => row.token)

					respond({
						state: "COMPLETE",
						result: {endResult: "OK"},

						cert: {
							certificateLevel: "QUALIFIED",
							value: cert.toString("base64"),
						},

						signature: {
							algorithm: "sha256WithRSAEncryption",
							value: signWithRsa(
								JOHN_RSA_KEYS.privateKey,
								token
							).toString("base64")
						}
					}, req, res)
				}))

				var authenticating = yield this.request("/sessions", {
					method: "POST",
					form: {method: "smart-id", personalId: "60001019906"}
				})

				authenticating.statusCode.must.equal(202)

				tokenHash.must.eql(sha256(yield authenticationsDb.read(sql`
					SELECT token FROM authentications
					ORDER BY created_at DESC
					LIMIT 1
				`).then((row) => row.token)))

				var location = authenticating.headers.location
				var authenticated = yield this.request(location, {
					method: "POST",
					headers: {Accept: `application/x-empty, ${ERR_TYPE}`},
					form: {method: "smart-id"}
				})

				authenticated.statusCode.must.equal(204)
				authenticated.headers.location.must.equal("/user")

				var cookies = parseCookies(authenticated.headers["set-cookie"])
				var sessionToken = Buffer.from(cookies.session_token.value, "hex")

				var authentications = yield authenticationsDb.search(sql`
					SELECT * FROM authentications
				`)

				authentications.must.eql([new ValidAuthentication({
					id: authentications[0].id,
					authenticated: true,
					country: "EE",
					personal_id: "60001019906",
					method: "smart-id",
					certificate: authentications[0].certificate,
					created_ip: "127.0.0.1",
					created_at: authentications[0].created_at,
					updated_at: authentications[0].updated_at,
					token: authentications[0].token
				})])

				authentications[0].token.must.not.eql(sessionToken)

				var users = yield usersDb.search(sql`SELECT * FROM users`)

				users.must.eql([new ValidUser({
					id: users[0].id,
					uuid: users[0].uuid,
					country: "EE",
					personal_id: "60001019906",
					name: "John Smith",
					language: "et",
					created_at: users[0].created_at,
					updated_at: users[0].updated_at
				})])

				var sessions = yield sessionsDb.search(sql`SELECT * FROM sessions`)

				sessions.must.eql([new ValidSession({
					id: sessions[0].id,
					user_id: users[0].id,
					method: "smart-id",
					token_sha256: sha256(sessionToken),
					created_ip: "127.0.0.1",
					authentication_id: authentications[0].id,
					created_at: sessions[0].created_at,
					updated_at: sessions[0].updated_at
				})])
			})

			it("must respond with 422 given certificate from untrusted issuer",
				function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "AUTHENTICATION",
						commonName: `SMITH,JOHN,PNOEE-${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${PERSONAL_ID}`
					},

					issuer: tsl.getBySubjectName([
						"C=EE",
						"O=AS Sertifitseerimiskeskus",
						"OU=Sertifitseerimisteenused",
						"CN=EID-SK 2007",
					].join(",")),

					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield signInWithSmartId(this.router, this.request, cert)

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Issuer")
				res.headers.location.must.equal("/sessions/new")

				var cookies = parseCookies(res.headers["set-cookie"])
				var flash = parseFlash(cookies.flash.value)
				flash.error.must.equal(t("INVALID_CERTIFICATE_ISSUER"))
			})

			it("must respond with 409 given non-Estonian's certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "AUTHENTICATION",
						commonName: `SMITH,JOHN,PNOLT-${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOLT-${PERSONAL_ID}`
					},

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield signInWithSmartId(this.router, this.request, cert)

				res.statusCode.must.equal(409)
				res.statusMessage.must.equal("Authentication Certificate Doesn't Match")
				res.headers.location.must.equal("/sessions/new")

				var cookies = parseCookies(res.headers["set-cookie"])
				var flash = parseFlash(cookies.flash.value)
				flash.error.must.equal("Authentication Certificate Doesn't Match")
			})

			it("must respond with 422 given future certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "AUTHENTICATION",
						commonName: `SMITH,JOHN,PNOEE-${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${PERSONAL_ID}`
					},

					validFrom: DateFns.addSeconds(new Date, 1),
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield signInWithSmartId(this.router, this.request, cert)

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Not Yet Valid")
				res.headers.location.must.equal("/sessions/new")

				var cookies = parseCookies(res.headers["set-cookie"])
				var flash = parseFlash(cookies.flash.value)
				flash.error.must.equal(t("CERTIFICATE_NOT_YET_VALID"))
			})

			it("must respond with 422 given past certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "AUTHENTICATION",
						commonName: `SMITH,JOHN,PNOEE-${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${PERSONAL_ID}`
					},

					validUntil: new Date,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield signInWithSmartId(this.router, this.request, cert)

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Expired")
				res.headers.location.must.equal("/sessions/new")

				var cookies = parseCookies(res.headers["set-cookie"])
				var flash = parseFlash(cookies.flash.value)
				flash.error.must.equal(t("CERTIFICATE_EXPIRED"))
			})

			it("must create session if Smart-Id session running", function*() {
				var waited = 0
				var res = yield signInWithSmartId(
					this.router,
					this.request,
					next(function*(req, res) {
						if (waited++ < 2) return void respond({state: "RUNNING"}, req, res)
						res.writeHead(200)

						var token = yield authenticationsDb.read(sql`
							SELECT token FROM authentications
							ORDER BY created_at DESC
							LIMIT 1
						`).then((row) => row.token)

						respond({
							state: "COMPLETE",
							result: {endResult: "OK"},

							cert: {
								certificateLevel: "QUALIFIED",
								value: SMART_ID_CERTIFICATE.toString("base64")
							},

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: signWithRsa(
									JOHN_RSA_KEYS.privateKey,
									token
								).toString("base64")
							}
						}, req, res)
					})
				)

				res.statusCode.must.equal(204)

				yield usersDb.search(sql`
					SELECT * FROM users
				`).must.then.not.be.empty()

				yield sessionsDb.search(sql`
					SELECT * FROM sessions
				`).must.then.not.be.empty()
			})

			_.each({
				RSA: [JOHN_RSA_KEYS, signWithRsa],
				ECDSA: [JOHN_ECDSA_KEYS, signWithEcdsa]
			}, function([keys, sign], algo) {
				it(`must create a session given an ${algo} signature`, function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationalUnitName: "AUTHENTICATION",
							commonName: `SMITH,JOHN,PNOEE-${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var res = yield signInWithSmartId(
						this.router,
						this.request,
						next(function*(req, res) {
							res.writeHead(200)

							var token = yield authenticationsDb.read(sql`
								SELECT token FROM authentications
								ORDER BY created_at DESC
								LIMIT 1
							`).then((row) => row.token)

							respond({
								state: "COMPLETE",
								result: {endResult: "OK"},
								cert: {value: cert.toString("base64")},

								signature: {
									algorithm: "sha256WithRSAEncryption",
									value: sign(keys.privateKey, token).toString("base64")
								}
							}, req, res)
						})
					)

					res.statusCode.must.equal(204)

					yield usersDb.search(sql`
						SELECT * FROM users
					`).must.then.not.be.empty()

					yield sessionsDb.search(sql`
						SELECT * FROM sessions
					`).must.then.not.be.empty()
				})

				it(`must respond with error given an invalid ${algo} signature`,
					function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationalUnitName: "AUTHENTICATION",
							commonName: `SMITH,JOHN,PNOEE-${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var errored = yield signInWithSmartId(
						this.router,
						this.request,
						respond.bind(null, {
							state: "COMPLETE",
							result: {endResult: "OK"},
							cert: {value: cert.toString("base64")},

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: Crypto.randomBytes(64).toString("base64")
							}
						})
					)

					errored.statusCode.must.equal(410)
					errored.statusMessage.must.equal("Invalid Smart-Id Signature")
					errored.headers.location.must.equal("/sessions/new")

					var cookies = Http.parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("SMART_ID_ERROR_INVALID_SIGNATURE"))

					var authentication = yield authenticationsDb.read(sql`
						SELECT * FROM authentications
					`)

					authentication.certificate.must.eql(cert)

					yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

					yield sessionsDb.search(sql`
						SELECT * FROM sessions
					`).must.then.be.empty()
				})
			})

			it("must respond with 422 given invalid personal id", function*() {
				this.router.post(`${SMART_ID_URL.path}authentication/etsi/:id`,
					function(req, res) {
					res.statusCode = 404
					respond({code: 404, message: "Not Found"}, req, res)
				})

				var res = yield this.request("/sessions", {
					method: "POST",
					form: {method: "smart-id", personalId: "60001011337"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Not a Smart-Id User")
				res.body.must.include(t("SMART_ID_ERROR_NOT_FOUND"))

				yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

				yield sessionsDb.search(sql`
					SELECT * FROM sessions
				`).must.then.be.empty()
			})

			it("must respond with 500 given Bad Request", function*() {
				this.router.post(`${SMART_ID_URL.path}authentication/etsi/:id`,
					function(req, res) {
					res.statusCode = 400
					respond({code: 400, message: "Bad Request"}, req, res)
				})

				var res = yield this.request("/sessions", {
					method: "POST",
					form: {method: "smart-id", personalId: "60001011337"}
				})

				res.statusCode.must.equal(500)
				res.statusMessage.must.equal("Unknown Smart-Id Error")
				res.body.must.not.include("FOOLANG")

				yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

				yield sessionsDb.search(sql`
					SELECT * FROM sessions
				`).must.then.be.empty()
			})

			_.each(SMART_ID_SESSION_ERRORS,
				function([statusCode, statusMessage, error], code) {
				it(`must respond with error given ${code} while signing`, function*() {
					var errored = yield signInWithSmartId(
						this.router,
						this.request,
						respond.bind(null, {state: "COMPLETE", result: {endResult: code}})
					)

					errored.statusCode.must.equal(statusCode)
					errored.statusMessage.must.equal(statusMessage)
					errored.headers.location.must.equal("/sessions/new")

					var cookies = Http.parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t(error))

					yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

					yield sessionsDb.search(sql`
						SELECT * FROM sessions
					`).must.then.be.empty()
				})
			})

			it("must time out after 2 minutes", function*() {
				var waited = 0
				var errored = yield signInWithSmartId(
					this.router,
					this.request,
					(req, res) => {
						if (waited++ == 0) this.time.tick(119 * 1000)
						else this.time.tick(1000)
						respond({state: "RUNNING"}, req, res)
					}
				)

				errored.statusCode.must.equal(410)
				errored.statusMessage.must.equal("Smart-Id Timeout")
				errored.headers.location.must.equal("/sessions/new")
				waited.must.equal(2)

				var cookies = Http.parseCookies(errored.headers["set-cookie"])
				var res = yield this.request(errored.headers.location, {
					headers: {Cookie: Http.serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("SMART_ID_ERROR_TIMEOUT_AUTH"))

				yield usersDb.search(sql`SELECT * FROM users`).must.then.be.empty()

				yield sessionsDb.search(sql`
					SELECT * FROM sessions
				`).must.then.be.empty()
			})
		})
	})

	describe("DELETE /:id", function() {
		require("root/test/fixtures").user()
		require("root/test/fixtures").csrfRequest()
		require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

		it("must delete session and delete cookie if current session", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "POST",
				form: {_method: "delete"}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			var cookies = parseCookies(res.headers["set-cookie"])
			cookies[SESSION_COOKIE_NAME].expires.must.be.lte(new Date)

			var flash = parseFlash(cookies.flash.value)
			flash.notice.must.equal(t("CURRENT_SESSION_DELETED"))

			yield sessionsDb.read(this.session).must.then.eql({
				__proto__: this.session,
				deleted_at: new Date
			})
		})

		it("must delete session but not delete cookie if not current session",
			function*() {
			var session = yield sessionsDb.create(new ValidSession({
				user_id: this.user.id
			}))

			var res = yield this.request("/sessions/" + session.id, {
				method: "POST",
				form: {_method: "delete"}
			})

			res.statusCode.must.equal(303)

			var cookies = parseCookies(res.headers["set-cookie"])
			cookies.must.not.have.property(SESSION_COOKIE_NAME)

			var flash = parseFlash(cookies.flash.value)
			flash.notice.must.equal(t("SESSION_DELETED"))

			yield sessionsDb.read(this.session).must.then.eql(this.session)

			yield sessionsDb.read(session).must.then.eql({
				__proto__: session,
				updated_at: new Date,
				deleted_at: new Date
			})
		})

		it("must redirect back to referrer", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "POST",
				headers: {Referer: this.url + "/initiatives"},
				form: {_method: "delete"}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(this.url + "/initiatives")
		})

		it("must redirect to home page if on /user", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "POST",
				headers: {Referer: this.url + "/user"},
				form: {_method: "delete"}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")
		})

		it("must not reset CSRF token", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "POST",
				form: {_method: "delete"}
			})

			res.statusCode.must.equal(303)

			var cookies = parseCookies(res.headers["set-cookie"])
			cookies.must.not.have.property("csrf_token")
		})

		it("must respond with 404 given other user's session", function*() {
			var user = yield createUser()
			
			var session = yield sessionsDb.create(new ValidSession({
				user_id: user.id
			}))

			var res = yield this.request("/sessions/" + session.id, {
				method: "POST",
				form: {_method: "delete"}
			})

			res.statusCode.must.equal(404)
			res.statusMessage.must.equal("Session Not Found")
			yield sessionsDb.read(this.session).must.then.eql(this.session)
			yield sessionsDb.read(session).must.then.eql(session)
		})

		it("must respond with 404 given non-existent session", function*() {
			var res = yield this.request("/sessions/" + this.session.id + 1, {
				method: "POST",
				form: {_method: "delete"}
			})

			res.statusCode.must.equal(404)
			res.statusMessage.must.equal("Session Not Found")
			yield sessionsDb.read(this.session).must.then.eql(this.session)
		})

		it("must respond with 410 given deleted session id", function*() {
			var session = yield sessionsDb.create(new ValidSession({
				user_id: this.user.id,
				deleted_at: new Date
			}))

			var res = yield this.request("/sessions/" + session.id, {
				method: "POST",
				form: {_method: "delete"}
			})

			res.statusCode.must.equal(410)
			res.statusMessage.must.equal("Session Gone")
			yield sessionsDb.read(this.session).must.then.eql(this.session)
			yield sessionsDb.read(session).must.then.eql(session)
		})
	})
})

function* signInWithIdCard(_router, request, cert, headers) {
	var authenticating = yield request("/sessions", {
		method: "POST",

		headers: _.assign({
			Accept: SIGNABLE_TYPE,
			"Content-Type": CERTIFICATE_TYPE
		}, headers),

		body: cert.toBuffer()
	})

	authenticating.statusCode.must.equal(202)

	var authentication = yield authenticationsDb.read(sql`
		SELECT * FROM authentications
	`)

	return request(authenticating.headers.location, {
		method: "POST",

		headers: {
			Accept: `application/x-empty, ${ERR_TYPE}`,
			"Content-Type": SIGNATURE_TYPE
		},

		body: signWithRsa(JOHN_RSA_KEYS.privateKey, authentication.token)
	})
}

function* signInWithMobileId(router, request, cert, headers) {
	router.post(`${MOBILE_ID_URL.path}certificate`, function(req, res) {
		respond({result: "OK", cert: cert.toString("base64")}, req, res)
	})

	router.post(
		`${MOBILE_ID_URL.path}authentication`,
		respond.bind(null, {sessionID: SESSION_ID})
	)

	router.get(`${MOBILE_ID_URL.path}authentication/session/:token`,
		next(function*(req, res) {
		res.writeHead(200)

		var token = yield authenticationsDb.read(sql`
			SELECT token FROM authentications
			ORDER BY created_at DESC
			LIMIT 1
		`).then((row) => row.token)

		respond({
			result: "OK",
			state: "COMPLETE",
			cert: cert.toString("base64"),

			signature: {
				algorithm: "sha256WithRSAEncryption",
				value: signWithRsa(JOHN_RSA_KEYS.privateKey, token).toString("base64")
			}
		}, req, res)
	}))

	var authenticating = yield request("/sessions", {
		method: "POST",
		headers: headers || {},
		form: {
			method: "mobile-id",
			personalId: "60001019906",
			phoneNumber: "+37200000766"
		}
	})

	authenticating.statusCode.must.equal(202)

	return request(authenticating.headers.location, {
		method: "POST",
		headers: {Accept: `application/x-empty, ${ERR_TYPE}`},
		form: {method: "mobile-id"}
	})
}

function* signInWithSmartId(router, request, cert, headers) {
	router.post(
		`${SMART_ID_URL.path}authentication/etsi/:id`,
		respond.bind(null, {sessionID: SESSION_ID})
	)

	router.get(
		`${SMART_ID_URL.path}session/:token`,
		typeof cert == "function" ? cert : next(function*(req, res) {
			res.writeHead(200)

			var token = yield authenticationsDb.read(sql`
				SELECT token FROM authentications
				ORDER BY created_at DESC
				LIMIT 1
			`).then((row) => row.token)

			respond({
				state: "COMPLETE",
				result: {endResult: "OK"},
				cert: {
					certificateLevel: "QUALIFIED",
					value: cert.toString("base64")
				},

				signature: {
					algorithm: "sha256WithRSAEncryption",
					value: signWithRsa(JOHN_RSA_KEYS.privateKey, token).toString("base64")
				}
			}, req, res)
		})
	)

	var authenticating = yield request("/sessions", {
		method: "POST",
		headers: headers || {},
		form: {method: "smart-id", personalId: "60001019906"}
	})

	authenticating.statusCode.must.equal(202)

	return request(authenticating.headers.location, {
		method: "POST",
		headers: {Accept: `application/x-empty, ${ERR_TYPE}`},
		form: {method: "smart-id"}
	})
}

function signWithRsa(key, signable) {
	return Crypto.createSign("sha256").update(signable).sign(key)
}

function signWithEcdsa(key, signable) {
	var signatureDer = Crypto.createSign("sha256").update(signable).sign(key)
	var signatureAsn = X509Asn.EcSignature.decode(signatureDer)

	return Buffer.concat([
		signatureAsn.r.toBuffer("be", 32),
		signatureAsn.s.toBuffer("be", 32)
	])
}

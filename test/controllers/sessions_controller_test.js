var _ = require("root/lib/underscore")
var Url = require("url")
var Config = require("root").config
var Crypto = require("crypto")
var ValidUser = require("root/test/valid_user")
var ValidAuthentication = require("root/test/valid_authentication")
var ValidSession = require("root/test/valid_session")
var Certificate = require("undersign/lib/certificate")
var DateFns = require("date-fns")
var X509Asn = require("undersign/lib/x509_asn")
var {respond} = require("root/test/fixtures")
var {parseCookies} = require("root/test/web")
var {serializeCookies} = require("root/test/web")
var {newCertificate} = require("root/test/fixtures")
var usersDb = require("root/db/users_db")
var authenticationsDb = require("root/db/authentications_db")
var sessionsDb = require("root/db/sessions_db")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var sql = require("sqlate")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var {tsl} = require("root")
var SITE_HOSTNAME = Url.parse(Config.url).hostname
var PARLIAMENT_SITE_HOSTNAME = Url.parse(Config.parliamentSiteUrl).hostname
var LOCAL_SITE_HOSTNAME = Url.parse(Config.localSiteUrl).hostname
var MOBILE_ID_URL = Url.parse("https://mid.sk.ee/mid-api/")
var SMART_ID_URL = Url.parse("https://rp-api.smart-id.com/v1/")
var ERR_TYPE = "application/vnd.rahvaalgatus.error+json"
var {JOHN_ECDSA_KEYS} = require("root/test/fixtures")
var {JOHN_RSA_KEYS} = require("root/test/fixtures")
var {VALID_ISSUERS} = require("root/test/fixtures")
var {PHONE_NUMBER_TRANSFORMS} = require("root/test/fixtures")
var PERSONAL_ID = "38706181337"
var SESSION_ID = "7c8bdd56-6772-4264-ba27-bf7a9ef72a11"
var SESSION_LENGTH_IN_DAYS = 120

var AUTH_CERTIFICATE_EXTENSIONS = [{
	extnID: "extendedKeyUsage",
	critical: true,
	extnValue: [[1, 3, 6, 1, 5, 5, 7, 3, 2]]
}]

var ID_CARD_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationName: "ESTEID",
		organizationalUnitName: "authentication",
		commonName: `SMITH,JOHN,${PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: `PNOEE-${PERSONAL_ID}`
	},

	extensions: AUTH_CERTIFICATE_EXTENSIONS,
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
		serialNumber: `PNOEE-${PERSONAL_ID}`
	},

	extensions: AUTH_CERTIFICATE_EXTENSIONS,
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

	extensions: AUTH_CERTIFICATE_EXTENSIONS,
	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var MOBILE_ID_CREATE_ERRORS = {
	NOT_FOUND: [
		422,
		"Not a Mobile-Id User or Personal Id Mismatch",
		"MOBILE_ID_ERROR_NOT_FOUND"
	],

	NOT_ACTIVE: [
		422,
		"Mobile-Id Certificates Not Activated",
		"MOBILE_ID_ERROR_NOT_ACTIVE"
	]
}

var MOBILE_ID_SESSION_ERRORS = {
	TIMEOUT: [
		410,
		"Mobile-Id Timeout",
		"MOBILE_ID_ERROR_TIMEOUT_AUTH"
	],

	NOT_MID_CLIENT: [
		410,
		"Mobile-Id Certificates Not Activated",
		"MOBILE_ID_ERROR_NOT_ACTIVE"
	],

	USER_CANCELLED: [
		410,
		"Mobile-Id Cancelled",
		"MOBILE_ID_ERROR_USER_CANCELLED_AUTH"
	],

	SIGNATURE_HASH_MISMATCH: [
		410,
		"Mobile-Id Signature Hash Mismatch",
		"MOBILE_ID_ERROR_SIGNATURE_HASH_MISMATCH_AUTH"
	],

	PHONE_ABSENT: [
		410,
		"Mobile-Id Phone Absent",
		"MOBILE_ID_ERROR_PHONE_ABSENT_AUTH"
	],

	DELIVERY_ERROR: [
		410,
		"Mobile-Id Delivery Error",
		"MOBILE_ID_ERROR_DELIVERY_ERROR_AUTH"
	],

	SIM_ERROR: [
		410,
		"Mobile-Id SIM Application Error",
		"MOBILE_ID_ERROR_SIM_ERROR"
	],
}

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

	describe("GET /new", function() {
		describe("when not logged in", function() {
			it("must render signin page", function*() {
				var res = yield this.request("/sessions/new")
				res.statusCode.must.equal(200)
				res.body.must.include(t("SIGNIN_PAGE_TITLE"))
			})

			;[PARLIAMENT_SITE_HOSTNAME, LOCAL_SITE_HOSTNAME].forEach(function(host) {
				it(`must redirect to ${SITE_HOSTNAME} from ${host}`, function*() {
					var path = "/sessions/new?foo=bar"
					var res = yield this.request(path, {headers: {Host: host}})
					res.statusCode.must.equal(301)
					res.headers.location.must.equal(Config.url + path)
				})
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must redirect to user page", function*() {
				var res = yield this.request("/sessions/new")
				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/user")
			})

			it("must redirect back to referrer on same host", function*() {
				var res = yield this.request("/sessions/new", {
					headers: {Referer: this.url + "/initiatives"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(this.url + "/initiatives")
			})

			;[
				Config.url,
				Config.parliamentSiteUrl,
				Config.localSiteUrl
			].forEach(function(url) {
				it(`must redirect back to ${Url.parse(url).hostname}`, function*() {
					var res = yield this.request("/sessions/new", {
						headers: {Referer: url + "/initiatives"}
					})

					res.statusCode.must.equal(302)
					res.headers.location.must.equal(url + "/initiatives")
				})
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

	describe("POST /", function() {
		require("root/test/fixtures").csrf()
		require("root/test/time")()

		function mustSignIn(signIn, cert) {
			describe("as sign-in-able", function() {
				it("must set session cookie", function*() {
					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.be.between(200, 399)

					var cookies = parseCookies(res.headers["set-cookie"])
					cookies.session_token.path.must.equal("/")
					cookies.session_token.domain.must.equal(Config.cookieDomain)
					cookies.session_token.httpOnly.must.be.true()
					cookies.session_token.extensions.must.include("SameSite=Lax")

					cookies.session_token.maxAge.must.equal(
						SESSION_LENGTH_IN_DAYS * 86400
					)

					var cookieToken = Buffer.from(cookies.session_token.value, "hex")
					var session = sessionsDb.read(sql`SELECT * FROM sessions`)
					session.token_sha256.must.eql(sha256(cookieToken))
				})

				it("must redirect back to user profile", function*() {
					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.be.between(200, 399)
					res.headers.location.must.equal("/user")
				})

				it("must redirect back to user profile if on signin page", function*() {
					var res = yield signIn(this.router, this.request, cert, {
						Referer: this.url + "/sessions/new"
					})

					res.statusCode.must.be.between(200, 399)
					res.headers.location.must.equal("/user")
				})

				it("must redirect back to referrer on same host", function*() {
					var res = yield signIn(this.router, this.request, cert, {
						Referer: this.url + "/initiatives"
					})

					res.statusCode.must.be.between(200, 399)
					res.headers.location.must.equal(this.url + "/initiatives")
				})

				;[
					Config.url,
					Config.parliamentSiteUrl,
					Config.localSiteUrl
				].forEach(function(url) {
					it(`must redirect back to ${Url.parse(url).hostname}`, function*() {
						var res = yield signIn(this.router, this.request, cert, {
							Referer: url + "/initiatives"
						})

						res.statusCode.must.be.between(200, 399)
						res.headers.location.must.equal(url + "/initiatives")
					})
				})

				it("must not redirect to other hosts", function*() {
					var res = yield signIn(this.router, this.request, cert, {
						Referer: "http://example.com/evil"
					})

					res.statusCode.must.be.between(200, 399)
					res.headers.location.must.equal("/user")
				})

				it("must reset the CSRF token", function*() {
					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.be.between(200, 399)
					var cookies = parseCookies(res.headers["set-cookie"])
					cookies.csrf_token.value.must.not.equal(this.csrfToken)
				})

				it("must store IP address and user-agent", function*() {
					var res = yield signIn(this.router, this.request, cert, {
						"User-Agent": "Mozilla"
					})

					res.statusCode.must.be.between(200, 399)
					res.headers.location.must.equal("/user")

					var session = sessionsDb.read(sql`SELECT * FROM sessions`)
					session.created_ip.must.equal("127.0.0.1")
					session.created_user_agent.must.equal("Mozilla")
				})

				it("must create a session given a non-ETSI semantic personal id",
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

						extensions: AUTH_CERTIFICATE_EXTENSIONS,
						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.be.between(200, 399)

					var user = usersDb.read(sql`SELECT * FROM users`)
					user.country.must.equal("EE")
					user.personal_id.must.equal(PERSONAL_ID)

					sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
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
								serialNumber: `PNOEE-${PERSONAL_ID}`
							},

							extensions: AUTH_CERTIFICATE_EXTENSIONS,
							issuer: issuer,
							publicKey: JOHN_RSA_KEYS.publicKey
						}))

						var res = yield signIn(this.router, this.request, cert)
						res.statusCode.must.be.between(200, 399)

						usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
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
						commonName: `SMITH,JOHN,${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${PERSONAL_ID}`
					},

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						"X-Client-Certificate": serializeCertificateForHeader(cert),
						"X-Client-Certificate-Verification": "SUCCESS",
						"X-Client-Certificate-Secret": Config.idCardAuthenticationSecret
					},

					form: {method: "id-card"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Signed In")
				res.headers.location.must.equal("/user")

				var cookies = parseCookies(res.headers["set-cookie"])
				var sessionToken = Buffer.from(cookies.session_token.value, "hex")

				var authentications = authenticationsDb.search(sql`
					SELECT * FROM authentications
				`)

				authentications.must.eql([new ValidAuthentication({
					id: authentications[0].id,
					authenticated: true,
					country: "EE",
					personal_id: PERSONAL_ID,
					method: "id-card",
					certificate: cert,
					created_ip: "127.0.0.1",
					created_at: authentications[0].created_at,
					updated_at: authentications[0].updated_at,
					token: authentications[0].token
				})])

				authentications[0].token.must.not.eql(sessionToken)

				var users = usersDb.search(sql`SELECT * FROM users`)

				users.must.eql([new ValidUser({
					id: users[0].id,
					uuid: users[0].uuid,
					country: "EE",
					personal_id: PERSONAL_ID,
					name: "John Smith",
					language: "et",
					created_at: users[0].created_at,
					updated_at: users[0].updated_at
				})])

				var sessions = sessionsDb.search(sql`SELECT * FROM sessions`)

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

			it("must respond with 400 if certificate missing", function*() {
				var res = yield this.request("/sessions", {
					method: "POST",
					headers: {"X-Client-Certificate-Verification": "SUCCESS"},
					form: {method: "id-card"}
				})

				res.statusCode.must.equal(400)
				res.statusMessage.must.equal("Missing Certificate")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("ID_CARD_ERROR_CERTIFICATE_MISSING"))
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})

			it("must respond with 403 if proxy secret invalid", function*() {
				var cert = ID_CARD_CERTIFICATE

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						"X-Client-Certificate": serializeCertificateForHeader(cert),
						"X-Client-Certificate-Verification": "SUCCESS",

						"X-Client-Certificate-Secret":
							Config.idCardAuthenticationSecret.replace(/./g, "9")
					},

					form: {method: "id-card"}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Invalid Proxy Secret")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})

			it("must respond with 422 if Nginx validation fails", function*() {
				var cert = ID_CARD_CERTIFICATE

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						"X-Client-Certificate": serializeCertificateForHeader(cert),
						"X-Client-Certificate-Verification": "FAILURE",
						"X-Client-Certificate-Secret": Config.idCardAuthenticationSecret
					},

					form: {method: "id-card"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Sign In Failed")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("ID_CARD_ERROR_AUTHENTICATION_FAILED"))
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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
						serialNumber: `PNOEE-${PERSONAL_ID}`
					},

					issuer: tsl.getBySubjectName([
						"C=EE",
						"O=AS Sertifitseerimiskeskus",
						"OU=Sertifitseerimisteenused",
						"CN=EID-SK 2007",
					].join(",")),

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						"X-Client-Certificate": serializeCertificateForHeader(cert),
						"X-Client-Certificate-Verification": "SUCCESS",
						"X-Client-Certificate-Secret": Config.idCardAuthenticationSecret
					},

					form: {method: "id-card"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Issuer")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("INVALID_CERTIFICATE_ISSUER"))
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						"X-Client-Certificate": serializeCertificateForHeader(cert),
						"X-Client-Certificate-Verification": "SUCCESS",
						"X-Client-Certificate-Secret": Config.idCardAuthenticationSecret
					},

					form: {method: "id-card"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Estonian Users Only")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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
						serialNumber: `PNOEE-${PERSONAL_ID}`
					},

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					validFrom: DateFns.addSeconds(new Date, 1),
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						"X-Client-Certificate": serializeCertificateForHeader(cert),
						"X-Client-Certificate-Verification": "SUCCESS",
						"X-Client-Certificate-Secret": Config.idCardAuthenticationSecret
					},

					form: {method: "id-card"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Not Yet Valid")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("CERTIFICATE_NOT_YET_VALID"))
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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
						serialNumber: `PNOEE-${PERSONAL_ID}`
					},

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					validUntil: new Date,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						"X-Client-Certificate": serializeCertificateForHeader(cert),
						"X-Client-Certificate-Verification": "SUCCESS",
						"X-Client-Certificate-Secret": Config.idCardAuthenticationSecret
					},

					form: {method: "id-card"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Expired")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("CERTIFICATE_EXPIRED"))
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})

			it("must respond with 422 given non-auth certificate", function*() {
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

					extensions: [{
						extnID: "extendedKeyUsage",
						critical: true,
						extnValue: [[1, 3, 6, 1, 5, 5, 7, 3, 4]]
					}],

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield this.request("/sessions", {
					method: "POST",

					headers: {
						"X-Client-Certificate": serializeCertificateForHeader(cert),
						"X-Client-Certificate-Verification": "SUCCESS",
						"X-Client-Certificate-Secret": Config.idCardAuthenticationSecret
					},

					form: {method: "id-card"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Not Authentication Certificate")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("CERTIFICATE_NOT_FOR_AUTH"))
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})
		})

		describe("when authenticating via Mobile-Id", function() {
			mustSignIn(
				(router, request, authCert, headers) => signInWithMobileId(
					router,
					request,
					authCert,
					authCert,
					headers
				),

				MOBILE_ID_CERTIFICATE,
			)

			it("must create user and session", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "authentication",
						commonName: `SMITH,JOHN,${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${PERSONAL_ID}`
					},

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					req.headers.host.must.equal(MOBILE_ID_URL.host)

					req.body.relyingPartyName.must.equal(Config.mobileIdUser)
					req.body.relyingPartyUUID.must.equal(Config.mobileIdPassword)
					req.body.phoneNumber.must.equal("+37200000766")
					req.body.nationalIdentityNumber.must.equal(PERSONAL_ID)

					respond({result: "OK", cert: cert.toString("base64")}, req, res)
				})

				this.router.post(`${MOBILE_ID_URL.path}authentication`,
					function(req, res) {
					res.writeHead(200)
					req.headers.host.must.equal(MOBILE_ID_URL.host)

					req.body.relyingPartyName.must.equal(Config.mobileIdUser)
					req.body.relyingPartyUUID.must.equal(Config.mobileIdPassword)
					req.body.phoneNumber.must.equal("+37200000766")
					req.body.nationalIdentityNumber.must.equal(PERSONAL_ID)
					req.body.hashType.must.equal("SHA256")
					req.body.language.must.equal("EST")

					var {token} = authenticationsDb.read(sql`
						SELECT token FROM authentications
						ORDER BY created_at DESC
						LIMIT 1
					`)

					Buffer.from(req.body.hash, "base64").must.eql(sha256(token))

					respond({sessionID: SESSION_ID}, req, res)
				})

				this.router.get(`${MOBILE_ID_URL.path}authentication/session/:token`,
					function(req, res) {
					res.writeHead(200)
					req.headers.host.must.equal(MOBILE_ID_URL.host)
					req.params.token.must.equal(SESSION_ID)

					var {token} = authenticationsDb.read(sql`
						SELECT token FROM authentications
						ORDER BY created_at DESC
						LIMIT 1
					`)

					respond({
						state: "COMPLETE",
						result: "OK",
						cert: cert.toString("base64"),

						signature: {
							algorithm: "sha256WithRSAEncryption",
							value: signWithRsa(
								JOHN_RSA_KEYS.privateKey,
								token
							).toString("base64")
						}
					}, req, res)
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

				var {location} = authenticating.headers
				var authenticated = yield this.request(location, {
					method: "POST",
					headers: {Accept: `application/x-empty, ${ERR_TYPE}`},
					form: {method: "mobile-id"}
				})

				authenticated.statusCode.must.equal(204)
				authenticated.headers.location.must.equal("/user")

				var cookies = parseCookies(authenticated.headers["set-cookie"])
				var sessionToken = Buffer.from(cookies.session_token.value, "hex")

				var authentications = authenticationsDb.search(sql`
					SELECT * FROM authentications
				`)

				authentications.must.eql([new ValidAuthentication({
					id: authentications[0].id,
					authenticated: true,
					country: "EE",
					personal_id: PERSONAL_ID,
					method: "mobile-id",
					certificate: cert,
					created_ip: "127.0.0.1",
					created_at: authentications[0].created_at,
					updated_at: authentications[0].updated_at,
					token: authentications[0].token
				})])

				authentications[0].token.must.not.eql(sessionToken)

				var users = usersDb.search(sql`SELECT * FROM users`)

				users.must.eql([new ValidUser({
					id: users[0].id,
					uuid: users[0].uuid,
					country: "EE",
					personal_id: PERSONAL_ID,
					name: "John Smith",
					language: "et",
					created_at: users[0].created_at,
					updated_at: users[0].updated_at
				})])

				var sessions = sessionsDb.search(sql`SELECT * FROM sessions`)

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

			it("must respond with 409 given different preauth and auth certificates",
				function*() {
				var preauthCert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "digital signature",
						commonName: "SMITH,JOHN,38706181338",
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: "PNOEE-38706181338"
					},

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var authCert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "authentication",
						commonName: "SMITH,JOHN,38706181337",
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: "PNOEE-38706181337"
					},

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield signInWithMobileId(
					this.router,
					this.request,
					preauthCert,
					authCert
				)

				res.statusCode.must.equal(409)
				res.statusMessage.must.equal("Authentication Certificate Doesn't Match")
				res.headers.location.must.equal("/sessions/new")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("MOBILE_ID_ERROR_AUTH_CERTIFICATE_MISMATCH"))
			})

			it("must respond with 422 given non-Estonian's certificate",
				function*() {
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

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
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

			describe("for preauth certificate", function() {
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
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						issuer: tsl.getBySubjectName([
							"C=EE",
							"O=AS Sertifitseerimiskeskus",
							"OU=Sertifitseerimisteenused",
							"CN=EID-SK 2007",
						].join(",")),

						extensions: AUTH_CERTIFICATE_EXTENSIONS,
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

				it("must respond with 422 given future certificate", function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID (MOBIIL-ID)",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						extensions: AUTH_CERTIFICATE_EXTENSIONS,
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
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						extensions: AUTH_CERTIFICATE_EXTENSIONS,
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

				it("must respond with 422 given non-auth certificate", function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID (MOBIIL-ID)",
							organizationalUnitName: "authentication",
							commonName: `SMITH,JOHN,${PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						extensions: [{
							extnID: "extendedKeyUsage",
							critical: true,
							extnValue: [[1, 3, 6, 1, 5, 5, 7, 3, 4]]
						}],

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
					res.statusMessage.must.equal("Not Authentication Certificate")
					res.headers["content-type"].must.equal("text/html; charset=utf-8")
					res.body.must.include(t("CERTIFICATE_NOT_FOR_AUTH"))
				})
			})

			describe("for auth certificate", function() {
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
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						issuer: tsl.getBySubjectName([
							"C=EE",
							"O=AS Sertifitseerimiskeskus",
							"OU=Sertifitseerimisteenused",
							"CN=EID-SK 2007",
						].join(",")),

						extensions: AUTH_CERTIFICATE_EXTENSIONS,
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield signInWithMobileId(
						this.router,
						this.request,
						MOBILE_ID_CERTIFICATE,
						cert
					)

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Invalid Issuer")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("INVALID_CERTIFICATE_ISSUER"))
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
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						extensions: AUTH_CERTIFICATE_EXTENSIONS,
						validFrom: DateFns.addSeconds(new Date, 1),
						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield signInWithMobileId(
						this.router,
						this.request,
						MOBILE_ID_CERTIFICATE,
						cert
					)

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Certificate Not Yet Valid")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
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
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						extensions: AUTH_CERTIFICATE_EXTENSIONS,
						validUntil: new Date,
						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield signInWithMobileId(
						this.router,
						this.request,
						MOBILE_ID_CERTIFICATE,
						cert
					)

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Certificate Expired")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("CERTIFICATE_EXPIRED"))
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
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						extensions: [{
							extnID: "extendedKeyUsage",
							critical: true,
							extnValue: [[1, 3, 6, 1, 5, 5, 7, 3, 4]]
						}],

						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield signInWithMobileId(
						this.router,
						this.request,
						MOBILE_ID_CERTIFICATE,
						cert
					)

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Not Authentication Certificate")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("CERTIFICATE_NOT_FOR_AUTH"))
				})
			})

			it("must create session if Mobile-Id session running", function*() {
				var waited = 0
				var res = yield signInWithMobileId(
					this.router,
					this.request,
					MOBILE_ID_CERTIFICATE,
					function(req, res) {
						if (waited++ < 2) return void respond({state: "RUNNING"}, req, res)
						res.writeHead(200)

						var {token} = authenticationsDb.read(sql`
							SELECT token FROM authentications
							ORDER BY created_at DESC
							LIMIT 1
						`)

						respond({
							state: "COMPLETE",
							result: "OK",
							cert: MOBILE_ID_CERTIFICATE.toString("base64"),

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: signWithRsa(
									JOHN_RSA_KEYS.privateKey,
									token
								).toString("base64")
							}
						}, req, res)
					}
				)

				res.statusCode.must.equal(204)
				usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
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
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						extensions: AUTH_CERTIFICATE_EXTENSIONS,
						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var res = yield signInWithMobileId(
						this.router,
						this.request,
						MOBILE_ID_CERTIFICATE,
						function(req, res) {
							res.writeHead(200)

							var {token} = authenticationsDb.read(sql`
								SELECT token FROM authentications
								ORDER BY created_at DESC
								LIMIT 1
							`)

							respond({
								state: "COMPLETE",
								result: "OK",
								cert: cert.toString("base64"),

								signature: {
									algorithm: "sha256WithRSAEncryption",
									value: sign(keys.privateKey, token).toString("base64")
								}
							}, req, res)
						}
					)

					res.statusCode.must.equal(204)
					usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
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
							serialNumber: `PNOEE-${PERSONAL_ID}`
						},

						extensions: AUTH_CERTIFICATE_EXTENSIONS,
						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var errored = yield signInWithMobileId(
						this.router,
						this.request,
						MOBILE_ID_CERTIFICATE,
						respond.bind(null, {
							state: "COMPLETE",
							result: "OK",
							cert: cert.toString("base64"),

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: Crypto.randomBytes(64).toString("base64")
							}
						})
					)

					errored.statusCode.must.equal(410)
					errored.statusMessage.must.equal("Invalid Mobile-Id Signature")
					errored.headers.location.must.equal("/sessions/new")

					var cookies = parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("MOBILE_ID_ERROR_INVALID_SIGNATURE_AUTH"))

					var authentication = authenticationsDb.read(sql`
						SELECT * FROM authentications
					`)

					authentication.certificate.must.eql(cert)
					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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
					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})
			})

			_.each(MOBILE_ID_CREATE_ERRORS,
				function([statusCode, statusMessage, error], code) {
				it(`must respond with error given ${code}`, function*() {
					this.router.post(
						`${MOBILE_ID_URL.path}certificate`,
						respond.bind(null, {result: code})
					)

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

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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
				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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
				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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

				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})

			_.each(MOBILE_ID_SESSION_ERRORS,
				function([statusCode, statusMessage, error], code) {
				it(`must respond with error given ${code} while signing`, function*() {
					var errored = yield signInWithMobileId(
						this.router,
						this.request,
						MOBILE_ID_CERTIFICATE,
						respond.bind(null, {state: "COMPLETE", result: code})
					)

					errored.statusCode.must.equal(statusCode)
					errored.statusMessage.must.equal(statusMessage)
					errored.headers.location.must.equal("/sessions/new")

					var cookies = parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t(error))

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})
			})

			it("must time out after 2 minutes", function*() {
				var waited = 0
				var errored = yield signInWithMobileId(
					this.router,
					this.request,
					MOBILE_ID_CERTIFICATE,
					(req, res) => {
						if (waited++ == 0) {
							Url.parse(req.url, true).query.timeoutMs.must.equal("120000")
							this.time.tick(119 * 1000)
						}
						else {
							Url.parse(req.url, true).query.timeoutMs.must.equal("1000")
							this.time.tick(1000)
						}

						respond({state: "RUNNING"}, req, res)
					}
				)

				errored.statusCode.must.equal(410)
				errored.statusMessage.must.equal("Mobile-Id Timeout")
				errored.headers.location.must.equal("/sessions/new")
				waited.must.equal(2)

				var cookies = parseCookies(errored.headers["set-cookie"])
				var res = yield this.request(errored.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("MOBILE_ID_ERROR_TIMEOUT_AUTH"))

				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})
		})

		describe("when authenticating via Smart-Id", function() {
			mustSignIn(signInWithSmartId, SMART_ID_CERTIFICATE)

			it("must create user and session", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "AUTHENTICATION",
						commonName: `SMITH,JOHN,PNOEE-${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${PERSONAL_ID}`
					},

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var tokenHash

				this.router.post(
					`${SMART_ID_URL.path}authentication/etsi/PNOEE-${PERSONAL_ID}`,
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

				this.router.get(`${SMART_ID_URL.path}session/:token`, (req, res) => {
					res.writeHead(200)
					req.headers.host.must.equal(SMART_ID_URL.host)
					req.params.token.must.equal(SESSION_ID)

					var {token} = authenticationsDb.read(sql`
						SELECT token FROM authentications
						ORDER BY created_at DESC
						LIMIT 1
					`)

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
				})

				var authenticating = yield this.request("/sessions", {
					method: "POST",
					form: {method: "smart-id", personalId: PERSONAL_ID}
				})

				authenticating.statusCode.must.equal(202)

				tokenHash.must.eql(sha256(authenticationsDb.read(sql`
					SELECT token FROM authentications
					ORDER BY created_at DESC
					LIMIT 1
				`).token))

				var {location} = authenticating.headers
				var authenticated = yield this.request(location, {
					method: "POST",
					headers: {Accept: `application/x-empty, ${ERR_TYPE}`},
					form: {method: "smart-id"}
				})

				authenticated.statusCode.must.equal(204)
				authenticated.headers.location.must.equal("/user")

				var cookies = parseCookies(authenticated.headers["set-cookie"])
				var sessionToken = Buffer.from(cookies.session_token.value, "hex")

				var authentications = authenticationsDb.search(sql`
					SELECT * FROM authentications
				`)

				authentications.must.eql([new ValidAuthentication({
					id: authentications[0].id,
					authenticated: true,
					country: "EE",
					personal_id: PERSONAL_ID,
					method: "smart-id",
					certificate: cert,
					created_ip: "127.0.0.1",
					created_at: authentications[0].created_at,
					updated_at: authentications[0].updated_at,
					token: authentications[0].token
				})])

				authentications[0].token.must.not.eql(sessionToken)

				var users = usersDb.search(sql`SELECT * FROM users`)

				users.must.eql([new ValidUser({
					id: users[0].id,
					uuid: users[0].uuid,
					country: "EE",
					personal_id: PERSONAL_ID,
					name: "John Smith",
					language: "et",
					created_at: users[0].created_at,
					updated_at: users[0].updated_at
				})])

				var sessions = sessionsDb.search(sql`SELECT * FROM sessions`)

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

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield signInWithSmartId(this.router, this.request, cert)

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Issuer")
				res.headers.location.must.equal("/sessions/new")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INVALID_CERTIFICATE_ISSUER"))
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

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield signInWithSmartId(this.router, this.request, cert)

				res.statusCode.must.equal(409)
				res.statusMessage.must.equal("Authentication Certificate Doesn't Match")
				res.headers.location.must.equal("/sessions/new")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("SMART_ID_ERROR_AUTH_CERTIFICATE_MISMATCH"))
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

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					validFrom: DateFns.addSeconds(new Date, 1),
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield signInWithSmartId(this.router, this.request, cert)
				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Not Yet Valid")
				res.headers.location.must.equal("/sessions/new")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("CERTIFICATE_NOT_YET_VALID"))
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

					extensions: AUTH_CERTIFICATE_EXTENSIONS,
					validUntil: new Date,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield signInWithSmartId(this.router, this.request, cert)
				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Expired")
				res.headers.location.must.equal("/sessions/new")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("CERTIFICATE_EXPIRED"))
			})

			it("must respond with 422 given non-auth certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "AUTHENTICATION",
						commonName: `SMITH,JOHN,PNOEE-${PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${PERSONAL_ID}`
					},

					extensions: [{
						extnID: "extendedKeyUsage",
						critical: true,
						extnValue: [[1, 3, 6, 1, 5, 5, 7, 3, 4]]
					}],

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield signInWithSmartId(this.router, this.request, cert)
				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Not Authentication Certificate")
				res.headers.location.must.equal("/sessions/new")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("CERTIFICATE_NOT_FOR_AUTH"))
			})

			it("must create session if Smart-Id session running", function*() {
				var waited = 0
				var res = yield signInWithSmartId(
					this.router,
					this.request,
					function(req, res) {
						if (waited++ < 2) return void respond({state: "RUNNING"}, req, res)
						res.writeHead(200)

						var {token} = authenticationsDb.read(sql`
							SELECT token FROM authentications
							ORDER BY created_at DESC
							LIMIT 1
						`)

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
					}
				)

				res.statusCode.must.equal(204)
				usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
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

						extensions: AUTH_CERTIFICATE_EXTENSIONS,
						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var res = yield signInWithSmartId(
						this.router,
						this.request,
						function(req, res) {
							res.writeHead(200)

							var {token} = authenticationsDb.read(sql`
								SELECT token FROM authentications
								ORDER BY created_at DESC
								LIMIT 1
							`)

							respond({
								state: "COMPLETE",
								result: {endResult: "OK"},
								cert: {value: cert.toString("base64")},

								signature: {
									algorithm: "sha256WithRSAEncryption",
									value: sign(keys.privateKey, token).toString("base64")
								}
							}, req, res)
						}
					)

					res.statusCode.must.equal(204)
					usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
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

						extensions: AUTH_CERTIFICATE_EXTENSIONS,
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

					var cookies = parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("SMART_ID_ERROR_INVALID_SIGNATURE"))

					var authentication = authenticationsDb.read(sql`
						SELECT * FROM authentications
					`)

					authentication.certificate.must.eql(cert)

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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

				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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

				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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

					var cookies = parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t(error))

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
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

				var cookies = parseCookies(errored.headers["set-cookie"])
				var res = yield this.request(errored.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("SMART_ID_ERROR_TIMEOUT_AUTH"))

				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})
		})
	})

	describe("DELETE /:id", function() {
		require("root/test/fixtures").user()
		require("root/test/fixtures").csrf()
		require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

		it("must delete session and delete cookie if current session", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "DELETE"
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			var cookies = parseCookies(res.headers["set-cookie"])
			cookies[Config.sessionCookieName].expires.must.be.lte(new Date)

			res = yield this.request(res.headers.location, {
				headers: {Cookie: serializeCookies(cookies)}
			})

			res.statusCode.must.equal(200)
			res.body.must.include(t("CURRENT_SESSION_DELETED"))

			sessionsDb.read(this.session).must.eql({
				__proto__: this.session,
				deleted_at: new Date
			})
		})

		it("must delete session but not delete cookie if not current session",
			function*() {
			var session = sessionsDb.create(new ValidSession({user_id: this.user.id}))

			var res = yield this.request("/sessions/" + session.id, {
				method: "DELETE"
			})

			res.statusCode.must.equal(303)

			var cookies = parseCookies(res.headers["set-cookie"])
			cookies.must.not.have.property(Config.sessionCookieName)

			res = yield this.request(res.headers.location, {
				headers: {Cookie: serializeCookies(cookies)}
			})

			res.statusCode.must.equal(200)
			res.body.must.include(t("SESSION_DELETED"))

			sessionsDb.read(this.session).must.eql(this.session)

			sessionsDb.read(session).must.eql({
				__proto__: session,
				updated_at: new Date,
				deleted_at: new Date
			})
		})

		it("must redirect back to referrer", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "DELETE",
				headers: {Referer: this.url + "/initiatives"}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(this.url + "/initiatives")
		})

		it("must redirect to home page if on /user", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "DELETE",
				headers: {Referer: this.url + "/user"}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")
		})

		it("must not reset CSRF token", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "DELETE"
			})

			res.statusCode.must.equal(303)

			var cookies = parseCookies(res.headers["set-cookie"])
			cookies.must.not.have.property("csrf_token")
		})

		it("must respond with 404 given other user's session", function*() {
			var user = usersDb.create(new ValidUser)
			var session = sessionsDb.create(new ValidSession({user_id: user.id}))

			var res = yield this.request("/sessions/" + session.id, {
				method: "DELETE"
			})

			res.statusCode.must.equal(404)
			res.statusMessage.must.equal("Session Not Found")
			sessionsDb.read(this.session).must.eql(this.session)
			sessionsDb.read(session).must.eql(session)
		})

		it("must respond with 404 given non-existent session", function*() {
			var res = yield this.request("/sessions/" + this.session.id + 1, {
				method: "DELETE"
			})

			res.statusCode.must.equal(404)
			res.statusMessage.must.equal("Session Not Found")
			sessionsDb.read(this.session).must.eql(this.session)
		})

		it("must respond with 410 given deleted session id", function*() {
			var session = sessionsDb.create(new ValidSession({
				user_id: this.user.id,
				deleted_at: new Date
			}))

			var res = yield this.request("/sessions/" + session.id, {
				method: "DELETE"
			})

			res.statusCode.must.equal(410)
			res.statusMessage.must.equal("Session Gone")
			sessionsDb.read(this.session).must.eql(this.session)
			sessionsDb.read(session).must.eql(session)
		})
	})
})

function signInWithIdCard(_router, request, cert, headers) {
	return request("/sessions", {
		method: "POST",

		headers: _.assign({
			"X-Client-Certificate": serializeCertificateForHeader(cert),
			"X-Client-Certificate-Verification": "SUCCESS",
			"X-Client-Certificate-Secret": Config.idCardAuthenticationSecret
		}, headers),

		form: {method: "id-card"}
	})
}

function* signInWithMobileId(router, request, preauthCert, authCert, headers) {
	router.post(`${MOBILE_ID_URL.path}certificate`, function(req, res) {
		respond({result: "OK", cert: preauthCert.toString("base64")}, req, res)
	})

	router.post(
		`${MOBILE_ID_URL.path}authentication`,
		respond.bind(null, {sessionID: SESSION_ID})
	)

	router.get(
		`${MOBILE_ID_URL.path}authentication/session/:token`,
		typeof authCert == "function" ? authCert : function(req, res) {
			res.writeHead(200)

			var {token} = authenticationsDb.read(sql`
				SELECT token FROM authentications
				ORDER BY created_at DESC
				LIMIT 1
			`)

			respond({
				state: "COMPLETE",
				result: "OK",
				cert: authCert.toString("base64"),

				signature: {
					algorithm: "sha256WithRSAEncryption",
					value: signWithRsa(JOHN_RSA_KEYS.privateKey, token).toString("base64")
				}
			}, req, res)
		}
	)

	var authenticating = yield request("/sessions", {
		method: "POST",
		headers: headers || {},
		form: {
			method: "mobile-id",
			personalId: PERSONAL_ID,
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
		typeof cert == "function" ? cert : function(req, res) {
			res.writeHead(200)

			var {token} = authenticationsDb.read(sql`
				SELECT token FROM authentications
				ORDER BY created_at DESC
				LIMIT 1
			`)

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
		}
	)

	var authenticating = yield request("/sessions", {
		method: "POST",
		headers: headers || {},
		form: {method: "smart-id", personalId: PERSONAL_ID}
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

function serializeCertificateForHeader(cert) {
	// Should match the output of Nginx's ssl_client_escaped_cert.
	return encodeURIComponent(cert.toString("pem"))
}

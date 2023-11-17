var _ = require("root/lib/underscore")
var Url = require("url")
var Config = require("root").config
var Crypto = require("crypto")
var ValidUser = require("root/test/valid_user")
var ValidAuthentication = require("root/test/valid_authentication")
var ValidSession = require("root/test/valid_session")
var MobileId = require("undersign/lib/mobile_id")
var SmartId = require("undersign/lib/smart_id")
var {MobileIdSession} = require("undersign/lib/mobile_id")
var {SmartIdSession} = require("undersign/lib/smart_id")
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
var {pseudoHex} = require("root/lib/crypto")
var parseHtml = require("root/test/html").parse
var {parseRefreshHeader} = require("root/lib/http")
var {tsl} = require("root")
var SITE_HOSTNAME = Url.parse(Config.url).hostname
var PARLIAMENT_SITE_HOSTNAME = Url.parse(Config.parliamentSiteUrl).hostname
var LOCAL_SITE_HOSTNAME = Url.parse(Config.localSiteUrl).hostname
var MOBILE_ID_URL = Url.parse("https://mid.sk.ee/mid-api/")
var SMART_ID_URL = Url.parse("https://rp-api.smart-id.com/v1/")
var JSON_TYPE = "application/json; charset=utf-8"
var ERROR_TYPE = "application/vnd.rahvaalgatus.error+json"
var EMPTY_TYPE = "application/x-empty"
var HTML_TYPE = "text/html; charset=utf-8"
var {SITE_URLS} = require("root/test/fixtures")
var {JOHN_ECDSA_KEYS} = require("root/test/fixtures")
var {JOHN_RSA_KEYS} = require("root/test/fixtures")
var {VALID_ISSUERS} = require("root/test/fixtures")
var {PERSONAL_ID_TRANSFORMS} = require("root/test/fixtures")
var {PHONE_NUMBER_TRANSFORMS} = require("root/test/fixtures")
var PERSONAL_ID = "38706181337"
var SESSION_ID = "7c8bdd56-6772-4264-ba27-bf7a9ef72a11"
var SESSION_LENGTH_IN_DAYS = 120
var KEY_USAGE_DIGITAL_SIGNATURE = 128
var AUTH_RATE = 5
var AUTH_RATE_IN_MINUTES = 30

var AUTH_CERTIFICATE_EXTENSIONS = [{
	extnID: "keyUsage",
	critical: true,
	extnValue: {data: Buffer.from([KEY_USAGE_DIGITAL_SIGNATURE])}
}]

var ID_CARD_AUTH_CERTIFICATE_EXTENSIONS = _.concat(
	AUTH_CERTIFICATE_EXTENSIONS,
	{
		extnID: "extendedKeyUsage",
		critical: true,
		extnValue: [[1, 3, 6, 1, 5, 5, 7, 3, 2]]
	}
)

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

	extensions: ID_CARD_AUTH_CERTIFICATE_EXTENSIONS,
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

var MOBILE_ID_ERRORS = {
	TIMEOUT: [
		410,
		"Mobile-ID Timeout",
		"eid_view.mobile_id_errors.auth_timeout"
	],

	NOT_MID_CLIENT: [
		422,
		"Not a Mobile-ID User",
		"eid_view.mobile_id_errors.not_found"
	],

	USER_CANCELLED: [
		410,
		"Mobile-ID Cancelled",
		"eid_view.mobile_id_errors.auth_cancelled"
	],

	SIGNATURE_HASH_MISMATCH: [
		410,
		"Mobile-ID Signature Hash Mismatch",
		"eid_view.mobile_id_errors.auth_hash_mismatch"
	],

	PHONE_ABSENT: [
		410,
		"Mobile-ID Phone Absent",
		"eid_view.mobile_id_errors.auth_phone_absent"
	],

	DELIVERY_ERROR: [
		410,
		"Mobile-ID Delivery Error",
		"eid_view.mobile_id_errors.auth_delivery_error"
	],

	SIM_ERROR: [
		410,
		"Mobile-ID SIM Application Error",
		"eid_view.mobile_id_errors.sim_error"
	]
}

var SMART_ID_ERRORS = {
	USER_REFUSED: [
		410,
		"Smart-ID Cancelled",
		"eid_view.smart_id_errors.auth_cancelled"
	],

	TIMEOUT: [
		410,
		"Smart-ID Timeout",
		"eid_view.smart_id_errors.auth_timeout"
	],

	NO_SUITABLE_CERTIFICATE: [
		410,
		"No Smart-ID Certificate",
		"eid_view.smart_id_errors.auth_no_suitable_certificate"
	],

	DOCUMENT_UNUSABLE: [
		410,
		"Smart-ID Certificate Unusable",
		"eid_view.smart_id_errors.document_unusable"
	],

	WRONG_VC: [
		410,
		"Wrong Smart-ID Verification Code Chosen",
		"eid_view.smart_id_errors.wrong_vc"
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
				res.body.must.include(t("create_session_page.title"))
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

			it("must redirect back to referrer without host", function*() {
				var res = yield this.request("/sessions/new", {
					headers: {Referer: "/initiatives"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/initiatives")
			})

			it("must redirect back to referrer parameter without host", function*() {
				var res = yield this.request("/sessions/new?referrer=/initiatives")
				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/initiatives")
			})

			it("must redirect back to referrer on same host", function*() {
				var res = yield this.request("/sessions/new", {
					headers: {Referer: this.url + "/initiatives"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(this.url + "/initiatives")
			})

			it("must redirect back to referrer parameter on same host", function*() {
				var res = yield this.request(
					"/sessions/new?referrer=" + this.url + "/initiatives"
				)

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(this.url + "/initiatives")
			})

			SITE_URLS.forEach(function(url) {
				var host = Url.parse(url).hostname

				it(`must redirect back to ${host} referrer`, function*() {
					var res = yield this.request("/sessions/new", {
						headers: {Referer: url + "/initiatives"}
					})

					res.statusCode.must.equal(302)
					res.headers.location.must.equal(url + "/initiatives")
				})

				it(`must redirect back to ${host} referrer query parameter`,
					function*() {
					var res = yield this.request(
						"/sessions/new?referrer=" + url + "/initiatives"
					)

					res.statusCode.must.equal(302)
					res.headers.location.must.equal(url + "/initiatives")
				})
			})

			it("must not redirect back to other hosts", function*() {
				var res = yield this.request("/sessions/new", {
					headers: {Referer: "http://example.com/evil"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/user")
			})

			it("must not redirect back to other hosts via query parameter",
				function*() {
				var res = yield this.request(
					"/sessions/new?referrer=http://example.com/evil"
				)

				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/user")
			})

			it("must not redirect back to schemaless host", function*() {
				var res = yield this.request("/sessions/new", {
					headers: {Referer: "//example.com/evil"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/user")
			})

			it("must not redirect back to schemaless host via query parameter",
				function*() {
				var res = yield this.request(
					"/sessions/new?referrer=//example.com/evil"
				)

				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/user")
			})

			it("must not redirect back to schemaless host", function*() {
				var res = yield this.request("/sessions/new", {
					headers: {Referer: "\\\\1.2.3.4\\evil"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/user")
			})

			it("must not redirect back to schemaless host via query parameter",
				function*() {
				var res = yield this.request(
					"/sessions/new?referrer=\\\\1.2.3.4\\evil"
				)

				res.statusCode.must.equal(302)
				res.headers.location.must.equal("/user")
			})
		})
	})

	describe("POST /", function() {
		require("root/test/fixtures").csrf()
		require("root/test/time")()

		// TODO: Add a test for signing in with an existing user.
		function mustSignIn(signIn, assertError) {
			describe("as sign-in-able", function() {
				it("must respond with error given certificate from untrusted issuer",
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

						extensions: ID_CARD_AUTH_CERTIFICATE_EXTENSIONS,
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					assertError(yield signIn(this.router, this.request, cert), {
						code: 422,
						message: "Invalid Issuer",
						description: t("eid_view.errors.invalid_issuer")
					})

					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})

				it("must respond with error given future certificate", function*() {
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

						extensions: ID_CARD_AUTH_CERTIFICATE_EXTENSIONS,
						validFrom: DateFns.addSeconds(new Date, 1),
						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					assertError(yield signIn(this.router, this.request, cert), {
						code: 422,
						message: "Certificate Not Yet Valid",
						description: t("eid_view.errors.certificate_not_yet_valid")
					})

					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})

				it("must respond with error given past certificate", function*() {
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

						extensions: ID_CARD_AUTH_CERTIFICATE_EXTENSIONS,
						validUntil: new Date,
						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					assertError(yield signIn(this.router, this.request, cert), {
						code: 422,
						message: "Certificate Expired",
						description: t("eid_view.errors.certificate_expired")
					})

					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})

				it("must set session cookie", function*() {
					var res = yield signIn(this.router, this.request)
					res.statusCode.must.equal(303)
					res.statusMessage.must.match(/^Signed In with /)

					var cookies = parseCookies(res.headers["set-cookie"])
					cookies.session_token.path.must.equal("/")
					cookies.session_token.domain.must.equal(Config.sessionCookieDomain)
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
					var res = yield signIn(this.router, this.request)
					res.statusCode.must.equal(303)
					res.statusMessage.must.match(/^Signed In with /)
					res.headers.location.must.equal("/user")
				})

				it("must redirect back to user profile if on signin page", function*() {
					var res = yield signIn(this.router, this.request, null, {
						Referer: this.url + "/sessions/new"
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.match(/^Signed In with /)
					res.headers.location.must.equal("/user")
				})

				it("must redirect back to referrer without host", function*() {
					var res = yield signIn(this.router, this.request, null, {
						Referer: "/initiatives"
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.match(/^Signed In with /)
					res.headers.location.must.equal("/initiatives")
				})

				it("must redirect back to referrer on same host", function*() {
					var res = yield signIn(this.router, this.request, null, {
						Referer: this.url + "/initiatives"
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.match(/^Signed In with /)
					res.headers.location.must.equal(this.url + "/initiatives")
				})

				SITE_URLS.forEach(function(url) {
					it(`must redirect back to ${Url.parse(url).hostname}`, function*() {
						var res = yield signIn(this.router, this.request, null, {
							Referer: url + "/initiatives"
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.match(/^Signed In with /)
						res.headers.location.must.equal(url + "/initiatives")
					})
				})

				it("must not redirect to other hosts", function*() {
					var res = yield signIn(this.router, this.request, null, {
						headers: {Referer: "http://example.com/evil"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.match(/^Signed In with /)
					res.headers.location.must.equal("/user")
				})

				it("must reset the CSRF token", function*() {
					var res = yield signIn(this.router, this.request)
					res.statusCode.must.equal(303)
					res.statusMessage.must.match(/^Signed In with /)

					var cookies = parseCookies(res.headers["set-cookie"])
					cookies.csrf_token.value.must.not.equal(this.csrfToken)
				})

				it("must store IP address and user-agent", function*() {
					var res = yield signIn(this.router, this.request, null, {
						"User-Agent": "Mozilla"
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.match(/^Signed In with /)
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

						extensions: ID_CARD_AUTH_CERTIFICATE_EXTENSIONS,
						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield signIn(this.router, this.request, cert)
					res.statusCode.must.equal(303)
					res.statusMessage.must.match(/^Signed In with /)

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

							extensions: ID_CARD_AUTH_CERTIFICATE_EXTENSIONS,
							issuer: issuer,
							publicKey: JOHN_RSA_KEYS.publicKey
						}))

						var res = yield signIn(this.router, this.request, cert)
							res.statusCode.must.equal(303)
							res.statusMessage.must.match(/^Signed In with /)

						usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
					})
				})
			})
		}

		function mustRateLimit(signIn, assertOk, assertError) {
			describe("as a rate limited endpoint", function() {
				it(`must respond with error if created ${AUTH_RATE} authentications in the last ${AUTH_RATE_IN_MINUTES}m`, function*() {
					authenticationsDb.create(_.times(AUTH_RATE, () =>
						new ValidAuthentication({
							country: "EE",
							personal_id: PERSONAL_ID,
							method: "mobile-id",

							created_at: DateFns.addSeconds(
								DateFns.addMinutes(new Date, -AUTH_RATE_IN_MINUTES),
								1
							)
						})
					))

					assertError(yield signIn(this.router, this.request), {
						code: 429,
						message: "Too Many Incomplete Authentications",
						description: t("eid_view.errors.auth_rate_limit", {minutes: 1})
					})

					authenticationsDb.read(sql`
						SELECT COUNT(*) AS count FROM authentications
					`).count.must.equal(AUTH_RATE)
				})

				it(`must not respond with error if created ${AUTH_RATE} successful authentications in the last ${AUTH_RATE_IN_MINUTES}m`, function*() {
					authenticationsDb.create(_.times(AUTH_RATE, (_i) =>
						new ValidAuthentication({
							country: "EE",
							personal_id: PERSONAL_ID,
							method: "mobile-id",
							created_at: new Date,
							authenticated: true
						})
					))

					assertOk(yield signIn(this.router, this.request))
				})

				it(`must not respond with error if created <${AUTH_RATE} authentications in the last ${AUTH_RATE_IN_MINUTES}m`, function*() {
					authenticationsDb.create(_.times(AUTH_RATE - 1, (_i) =>
						new ValidAuthentication({
							country: "EE",
							personal_id: PERSONAL_ID,
							method: "mobile-id",
							created_at: DateFns.addSeconds(DateFns.addMinutes(new Date, -AUTH_RATE_IN_MINUTES), 1)
						})
					))

					assertOk(yield signIn(this.router, this.request))
				})

				it(`must not respond with error if created ${AUTH_RATE} authentications earlier than ${AUTH_RATE_IN_MINUTES}m`, function*() {
					authenticationsDb.create(_.times(AUTH_RATE - 1, (_i) =>
						new ValidAuthentication({
							country: "EE",
							personal_id: PERSONAL_ID,
							method: "mobile-id",
							created_at: DateFns.addMinutes(new Date, -AUTH_RATE_IN_MINUTES),
						})
					))

					assertOk(yield signIn(this.router, this.request))
				})
			})
		}

		describe("when authenticating via ID-card", function() {
			function assertError(res, obj) {
				res.statusCode.must.equal(obj.code)
				res.statusMessage.must.equal(obj.message)
				res.headers["content-type"].must.equal(HTML_TYPE)

				var el = parseHtml(res.body).querySelector("#error .description")
				el.textContent.must.equal(obj.description)
			}

			mustSignIn((router, request, cert, headers) => (
				signInWithIdCard(router, request, cert || ID_CARD_CERTIFICATE, headers)
			), assertError)

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

					extensions: ID_CARD_AUTH_CERTIFICATE_EXTENSIONS,
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
				res.statusMessage.must.equal("Signed In with ID-card")
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

			it("must respond with error if certificate missing", function*() {
				var res = yield this.request("/sessions", {
					method: "POST",
					headers: {"X-Client-Certificate-Verification": "SUCCESS"},
					form: {method: "id-card"}
				})

				assertError(res, {
					code: 400,
					message: "Missing Certificate",

					description:
						t("create_session_page.id_card_errors.certificate_missing")
				})

				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})

			it("must respond with error if proxy secret invalid", function*() {
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

				assertError(res, {
					code: 403,
					message: "Invalid Proxy Secret",

					description:
						t("create_session_page.id_card_errors.invalid_proxy_secret")
				})

				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})

			it("must respond with error if Nginx validation fails", function*() {
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

				assertError(res, {
					code: 422,
					message: "Sign In Failed",

					description:
						t("create_session_page.id_card_errors.authentication_failed")
				})

				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})

			it("must respond with error given non-Estonian's certificate",
				function*() {
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

					extensions: ID_CARD_AUTH_CERTIFICATE_EXTENSIONS,
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

				assertError(res, {
					code: 422,
					message: "Estonian Users Only",

					description:
						t("create_session_page.id_card_errors.non_estonian_certificate")
				})

				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})

			it("must respond with error given non-auth certificate", function*() {
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

					extensions: _.concat(AUTH_CERTIFICATE_EXTENSIONS, {
						extnID: "extendedKeyUsage",
						critical: true,
						extnValue: [[1, 3, 6, 1, 5, 5, 7, 3, 4]]
					}),

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

				assertError(res, {
					code: 422,
					message: "Not ID-card Authentication Certificate",
					description: t("eid_view.errors.certificate_not_for_auth")
				})

				usersDb.search(sql`SELECT * FROM users`).must.be.empty()
				sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
			})
		})

		describe("when authenticating via Mobile-ID", function() {
			describe("when without JavaScript", function() {
				function assertOk(res) {
					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Signed In with Mobile-ID")
				}

				function assertError(res, obj) {
					res.statusCode.must.equal(obj.code)
					res.statusMessage.must.equal(obj.message)
					res.headers["content-type"].must.equal(HTML_TYPE)

					var el = parseHtml(res.body).querySelector("#error .description")
					el.textContent.must.equal(obj.description)
				}

				mustSignIn((router, request, cert, headers) => signInWithMobileId(
					router,
					request,
					cert || MOBILE_ID_CERTIFICATE,
					headers
				), assertError)

				mustSignInWithMobileId(signInWithMobileId, assertOk, assertError)

				mustRateLimit((router, request) => (
					signInWithMobileId(router, request, MOBILE_ID_CERTIFICATE)
				), assertOk, assertError)

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

					var tokenHash

					this.router.post(`${MOBILE_ID_URL.path}authentication`, (req, res) => {
						req.headers.host.must.equal(MOBILE_ID_URL.host)

						req.body.relyingPartyName.must.equal(Config.mobileIdUser)
						req.body.relyingPartyUUID.must.equal(Config.mobileIdPassword)
						req.body.phoneNumber.must.equal("+37200000766")
						req.body.nationalIdentityNumber.must.equal(PERSONAL_ID)
						req.body.hashType.must.equal("SHA256")
						req.body.language.must.equal("EST")

						// The token hash has to be tested later when an authentication has
						// been created.
						tokenHash = Buffer.from(req.body.hash, "base64")

						respond({sessionID: SESSION_ID}, req, res)
					})

					this.router.get(`${MOBILE_ID_URL.path}authentication/session/:token`,
						function(req, res) {
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
								value: hashAndSignWithRsa(
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
							"personal-id": PERSONAL_ID,
							"phone-number": "+37200000766"
						}
					})

					authenticating.statusCode.must.equal(202)
					authenticating.statusMessage.must.equal("Signing In with Mobile-ID")
					authenticating.headers["content-type"].must.equal(HTML_TYPE)

					tokenHash.must.eql(sha256(authenticationsDb.read(sql`
						SELECT token FROM authentications
						ORDER BY created_at DESC
						LIMIT 1
					`).token))

					authenticating.headers["x-verification-code"].must.equal(
						padVerificationCode(MobileId.verification(tokenHash))
					)

					var waitUrl = parseRefreshHeader(authenticating.headers.refresh)[1]
					var signedIn = yield this.request(waitUrl)
					signedIn.statusCode.must.equal(303)
					signedIn.statusMessage.must.equal("Signed In with Mobile-ID")
					signedIn.headers.location.must.equal("/user")

					var cookies = parseCookies(signedIn.headers["set-cookie"])
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
						token: authentications[0].token,
						eid_session: new MobileIdSession("auth", SESSION_ID)
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

				it("must create session if session running once", function*() {
					var waited = 0

					var waiting = yield signInWithMobileId(
						this.router,
						this.request,
						function(req, res) {
							if (waited++ < 1) return void respond({
								state: "RUNNING"
							}, req, res)

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
									value: hashAndSignWithRsa(
										JOHN_RSA_KEYS.privateKey,
										token
									).toString("base64")
								}
							}, req, res)
						}
					)

					waiting.statusCode.must.equal(202)
					waiting.statusMessage.must.equal("Waiting for Mobile-ID")
					waiting.headers["content-type"].must.equal(HTML_TYPE)

					var waitUrl = parseRefreshHeader(waiting.headers.refresh)[1]
					var signedIn = yield this.request(waitUrl)
					assertOk(signedIn)
					signedIn.headers.location.must.equal("/user")

					usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
				})

				it("must respond with error if CSRF token invalid", function*() {
					var waiting = yield signInWithMobileId(
						this.router,
						this.request,
						respond.bind(null, {state: "RUNNING"})
					)

					waiting.statusCode.must.equal(202)
					waiting.statusMessage.must.equal("Waiting for Mobile-ID")
					waiting.headers["content-type"].must.equal(HTML_TYPE)

					var waitUrl = parseRefreshHeader(waiting.headers.refresh)[1]
					var res = yield this.request(waitUrl, {
						cookies: {csrf_token: pseudoHex(16)}
					})

					assertError(res, {
						code: 412,
						message: "Bad Query CSRF Token",
						description: t("create_session_page.errors.invalid_csrf_token")
					})

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})

				it("must respond with error given an already used authentication",
					function*() {
					var res = yield signInWithMobileId(
						this.router,
						this.request,
						MOBILE_ID_CERTIFICATE
					)

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Signed In with Mobile-ID")

					var auth = usersDb.read(sql`SELECT * FROM authentications`)
					var user = usersDb.read(sql`SELECT * FROM users`)
					var session = sessionsDb.read(sql`SELECT * FROM sessions`)

					assertError(yield this.request(res.req.path), {
						code: 410,
						message: "Session Already Created",

						description:
							t("create_session_page.errors.authentication_already_used")
					})

					usersDb.search(sql`SELECT * FROM authentications`).must.eql([auth])
					usersDb.search(sql`SELECT * FROM users`).must.eql([user])
					sessionsDb.search(sql`SELECT * FROM sessions`).must.eql([session])
				})

				_.each(PERSONAL_ID_TRANSFORMS, function(to, from) {
					it(`must transform Mobile-ID personal id ${from} to ${to}`,
						function*() {
						var created = 0

						this.router.post(`${MOBILE_ID_URL.path}authentication`, (req, res) => {
							++created
							req.body.phoneNumber.must.equal("+37200000766")
							req.body.nationalIdentityNumber.must.equal(to)
							respond({sessionID: SESSION_ID}, req, res)
						})

						var res = yield this.request("/sessions", {
							method: "POST",
							form: {
								method: "mobile-id",
								"personal-id": from,
								"phone-number": "+37200000766"
							}
						})

						created.must.equal(1)
						res.statusCode.must.equal(202)
						res.statusMessage.must.equal("Signing In with Mobile-ID")
					})
				})

				it("must respond with error given invalid personal id", function*() {
					var res = yield this.request("/sessions", {
						method: "POST",
						form: {
							method: "mobile-id",
							"personal-id": "3870618666",
							"phone-number": "+37200000766"
						}
					})

					assertError(res, {
						code: 422,
						message: "Invalid Personal Id",
						description: t("eid_view.errors.invalid_personal_id")
					})

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})

				it("must respond with error given invalid phone number", function*() {
					var res = yield this.request("/sessions", {
						method: "POST",
						form: {
							method: "mobile-id",
							"personal-id": "60001010",
							"phone-number": "+37200000766foobar"
						}
					})

					assertError(res, {
						code: 422,
						message: "Not a Mobile-ID User",
						description: t("eid_view.mobile_id_errors.not_found")
					})

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})

				_.each(PHONE_NUMBER_TRANSFORMS, function(to, from) {
					it(`must transform Mobile-ID number ${from} to ${to}`,
						function*() {
						var created = 0

						this.router.post(`${MOBILE_ID_URL.path}authentication`, (req, res) => {
							++created
							req.body.phoneNumber.must.equal(to)
							req.body.nationalIdentityNumber.must.equal(PERSONAL_ID)
							respond({sessionID: SESSION_ID}, req, res)
						})

						var res = yield this.request("/sessions", {
							method: "POST",
							form: {
								method: "mobile-id",
								"personal-id": PERSONAL_ID,
								"phone-number": from
							}
						})

						created.must.equal(1)
						res.statusCode.must.equal(202)
						res.statusMessage.must.equal("Signing In with Mobile-ID")
					})
				})
			})

			describe("when with JavaScript", function() {
				function assertOk(res) {
					res.statusCode.must.equal(200)
					res.statusMessage.must.equal("Authenticated with Mobile-ID")
					res.headers["content-type"].must.equal(JSON_TYPE)
					res.body.must.eql({state: "DONE"})
				}

				function assertError(res, obj) {
					res.statusCode.must.equal(obj.code)
					res.statusMessage.must.equal(obj.message)
					res.headers["content-type"].must.equal(ERROR_TYPE)
					res.body.must.eql(obj)
				}

				mustSignIn(function*(router, request, cert, headers) {
					var res = yield signInWithMobileId(
						router,
						request,
						cert || MOBILE_ID_CERTIFICATE,
						_.defaults({Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}, headers)
					)

					if (!(res.statusCode >= 200 && res.statusCode < 300)) return res
					return request(res.headers.location)
				}, assertError)

				mustSignInWithMobileId((router, request, cert) => (
					signInWithMobileId(router, request, cert, {
						Accept: `${JSON_TYPE}, ${ERROR_TYPE}`
					})
				), assertOk, assertError)

				mustRateLimit((router, request) => (
					signInWithMobileId(router, request, MOBILE_ID_CERTIFICATE, {
						Accept: `${JSON_TYPE}, ${ERROR_TYPE}`
					})
				), assertOk, assertError)

				it("must create user and session", function*() {
					this.router.post(
						`${MOBILE_ID_URL.path}authentication`,
						respond.bind(null, {sessionID: SESSION_ID})
					)

					this.router.get(`${MOBILE_ID_URL.path}authentication/session/:token`,
						function(req, res) {
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
								value: hashAndSignWithRsa(
									JOHN_RSA_KEYS.privateKey,
									token
								).toString("base64")
							}
						}, req, res)
					})

					var authenticating = yield this.request("/sessions", {
						method: "POST",
						headers: {Accept: `${EMPTY_TYPE}, ${ERROR_TYPE}`},

						form: {
							method: "mobile-id",
							"personal-id": PERSONAL_ID,
							"phone-number": "+37200000766"
						}
					})

					authenticating.statusCode.must.equal(202)
					authenticating.statusMessage.must.equal("Signing In with Mobile-ID")
					authenticating.headers.must.not.have.property("content-type")

					var tokenHash = sha256(authenticationsDb.read(sql`
						SELECT token FROM authentications
						ORDER BY created_at DESC
						LIMIT 1
					`).token)

					authenticating.headers["x-verification-code"].must.equal(
						padVerificationCode(MobileId.verification(tokenHash))
					)

					var waitUrl = parseRefreshHeader(authenticating.headers.refresh)[1]
					var authenticated = yield this.request(waitUrl, {
						headers: {Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					})

					authenticated.statusCode.must.equal(200)
					authenticated.statusMessage.must.equal("Authenticated with Mobile-ID")
					authenticated.headers["content-type"].must.equal(JSON_TYPE)
					authenticated.body.must.eql({state: "DONE"})

					var signedIn = yield this.request(authenticated.headers.location)
					signedIn.statusCode.must.equal(303)
					signedIn.statusMessage.must.equal("Signed In with Mobile-ID")
					signedIn.headers.location.must.equal("/user")

					var cookies = parseCookies(signedIn.headers["set-cookie"])
					var sessionToken = Buffer.from(cookies.session_token.value, "hex")
					var session = sessionsDb.read(sql`SELECT * FROM sessions`)
					session.token_sha256.must.eql(sha256(sessionToken))

					usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
				})

				it("must create session if session running once", function*() {
					var waited = 0

					var waiting = yield signInWithMobileId(
						this.router,
						this.request,
						function(req, res) {
							if (waited++ < 1) return void respond({
								state: "RUNNING"
							}, req, res)

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
									value: hashAndSignWithRsa(
										JOHN_RSA_KEYS.privateKey,
										token
									).toString("base64")
								}
							}, req, res)
						},
						{Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					)

					waiting.statusCode.must.equal(202)
					waiting.statusMessage.must.equal("Waiting for Mobile-ID")
					waiting.headers["content-type"].must.equal(JSON_TYPE)
					waiting.body.must.eql({state: "PENDING"})

					var waitUrl = parseRefreshHeader(waiting.headers.refresh)[1]
					var authenticated = yield this.request(waitUrl, {
						headers: {Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					})

					assertOk(authenticated)

					var signedIn = yield this.request(authenticated.headers.location)
					signedIn.statusCode.must.equal(303)
					signedIn.statusMessage.must.equal("Signed In with Mobile-ID")
					signedIn.headers.location.must.equal("/user")

					usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
				})

				it("must respond with error if CSRF token invalid", function*() {
					var waiting = yield signInWithMobileId(
						this.router,
						this.request,
						respond.bind(null, {state: "RUNNING"}),
						{Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					)

					waiting.statusCode.must.equal(202)
					waiting.statusMessage.must.equal("Waiting for Mobile-ID")
					waiting.headers["content-type"].must.equal(JSON_TYPE)

					var waitUrl = parseRefreshHeader(waiting.headers.refresh)[1]
					var res = yield this.request(waitUrl, {
						cookies: {csrf_token: pseudoHex(16)},
						headers: {Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					})

					assertError(res, {
						code: 412,
						message: "Bad Query CSRF Token",
						description: t("create_session_page.errors.invalid_csrf_token")
					})

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})

				it("must respond with error given invalid personal id", function*() {
					var res = yield this.request("/sessions", {
						method: "POST",
						headers: {Accept: `${EMPTY_TYPE}, ${ERROR_TYPE}`},

						form: {
							method: "mobile-id",
							"personal-id": "3870618666",
							"phone-number": "+37200000766"
						}
					})

					assertError(res, {
						code: 422,
						message: "Invalid Personal Id",
						description: t("eid_view.errors.invalid_personal_id")
					})

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})

				it("must respond with error given invalid phone number", function*() {
					var res = yield this.request("/sessions", {
						method: "POST",
						headers: {Accept: `${EMPTY_TYPE}, ${ERROR_TYPE}`},

						form: {
							method: "mobile-id",
							"personal-id": "60001010",
							"phone-number": "+37200000766foobar"
						}
					})

					assertError(res, {
						code: 422,
						message: "Not a Mobile-ID User",
						description: t("eid_view.mobile_id_errors.not_found")
					})

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})
			})

			function mustSignInWithMobileId(signIn, assertOk, assertError) {
				describe("as a Mobile-ID method", function() {
					_.each({
						RSA: [JOHN_RSA_KEYS, hashAndSignWithRsa],
						ECDSA: [JOHN_ECDSA_KEYS, hashAndSignWithEcdsa]
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

							assertOk(yield signIn(
								this.router,
								this.request,
								function(req, res) {
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
							))
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

							var res = yield signIn(
								this.router,
								this.request,
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

							assertError(res, {
								code: 410,
								message: "Invalid Mobile-ID Signature",

								description:
									t("eid_view.mobile_id_errors.auth_invalid_signature")
							})

							var authentication = authenticationsDb.read(sql`
								SELECT * FROM authentications
							`)

							authentication.certificate.must.eql(cert)
							usersDb.search(sql`SELECT * FROM users`).must.be.empty()
							sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
						})
					})

					it("must respond with error given invalid personal id from authentication start", function*() {
						this.router.post(
							`${MOBILE_ID_URL.path}authentication`,
							function(req, res) {
								res.statusCode = 400

								respond({
									error: "nationalIdentityNumber must contain of 11 digits"
								}, req, res)
							}
						)

						var res = yield signIn(
							this.router,
							this.request,
							MOBILE_ID_CERTIFICATE
						)

						assertError(res, {
							code: 422,
							message: "Not a Mobile-ID User",
							description: t("eid_view.mobile_id_errors.not_found")
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
					})

					it("must respond with error given invalid phone number from authentication start", function*() {
						this.router.post(
							`${MOBILE_ID_URL.path}authentication`,
							function(req, res) {
								res.statusCode = 400

								respond({
									error: "phoneNumber must contain of + and numbers(8-30)"
								}, req, res)
							}
						)

						var res = yield signIn(
							this.router,
							this.request,
							MOBILE_ID_CERTIFICATE
						)

						assertError(res, {
							code: 422,
							message: "Not a Mobile-ID User",
							description: t("eid_view.mobile_id_errors.not_found")
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
					})

					it("must respond with error given non-Estonian's certificate",
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

						assertError(yield signIn(this.router, this.request, cert), {
							code: 409,
							message: "Authentication Certificate Doesn't Match",

							description:
								t("eid_view.mobile_id_errors.auth_certificate_mismatch")
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
					})

					it("must respond with error given non-auth certificate", function*() {
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

						assertError(yield signIn(this.router, this.request, cert), {
							code: 422,
							message: "Not Authentication Certificate",
							description: t("eid_view.errors.certificate_not_for_auth")
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
					})

					it("must respond with error if session expired", function*() {
						var res = yield signIn(
							this.router,
							this.request,
							function(_req, res) { res.statusCode = 404; res.end() }
						)

						assertError(res, {
							code: 410,
							message: "Mobile-ID Timeout",
							description: t("eid_view.mobile_id_errors.auth_timeout")
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
					})

					it("must respond with error given Bad Request from authentication start", function*() {
						this.router.post(`${MOBILE_ID_URL.path}authentication`, (req, res) => {
							res.statusCode = 400
							respond({error: "Unknown language 'FOOLANG'"}, req, res)
						})

						assertError(yield signIn(this.router, this.request), {
							code: 500,
							message: "Unknown Mobile-ID Error",
							description: t("500_BODY")
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
					})

					it("must respond with error given Bad Request from session",
						function*() {
						var res = yield signIn(
							this.router,
							this.request,
							function(_req, res) { res.statusCode = 400; res.end() }
						)

						assertError(res, {
							code: 500,
							message: "Unknown Mobile-ID Error",
							description: t("500_BODY")
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
					})

					_.each(MOBILE_ID_ERRORS, ([
						statusCode,
						statusMessage,
						error
					], code) => it(`must respond with error given ${code} from session`,
						function*() {
						var res = yield signIn(
							this.router,
							this.request,
							respond.bind(null, {state: "COMPLETE", result: code})
						)

						assertError(res, {
							code: statusCode,
							message: statusMessage,
							description: t(error)
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
						})
					)
				})
			}
		})

		describe("when authenticating via Smart-ID", function() {
			describe("when without JavaScript", function() {
				function assertOk(res) {
					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Signed In with Smart-ID")
				}

				function assertError(res, obj) {
					res.statusCode.must.equal(obj.code)
					res.statusMessage.must.equal(obj.message)
					res.headers["content-type"].must.equal(HTML_TYPE)

					var el = parseHtml(res.body).querySelector("#error .description")
					el.textContent.must.equal(obj.description)
				}

				mustSignIn((router, request, cert, headers) => signInWithSmartId(
					router,
					request,
					cert || SMART_ID_CERTIFICATE,
					headers
				), assertError)

				mustSignInWithSmartId(signInWithSmartId, assertOk, assertError)

				mustRateLimit((router, request) => (
					signInWithSmartId(router, request, SMART_ID_CERTIFICATE)
				), assertOk, assertError)

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
								value: hashAndSignWithRsa(
									JOHN_RSA_KEYS.privateKey,
									token
								).toString("base64")
							}
						}, req, res)
					})

					var authenticating = yield this.request("/sessions", {
						method: "POST",
						form: {method: "smart-id", "personal-id": PERSONAL_ID}
					})

					authenticating.statusCode.must.equal(202)
					authenticating.statusMessage.must.equal("Signing In with Smart-ID")
					authenticating.headers["content-type"].must.equal(HTML_TYPE)

					tokenHash.must.eql(sha256(authenticationsDb.read(sql`
						SELECT token FROM authentications
						ORDER BY created_at DESC
						LIMIT 1
					`).token))

					authenticating.headers["x-verification-code"].must.equal(
						padVerificationCode(SmartId.verification(tokenHash))
					)

					var waitUrl = parseRefreshHeader(authenticating.headers.refresh)[1]
					var signedIn = yield this.request(waitUrl)
					signedIn.statusCode.must.equal(303)
					signedIn.statusMessage.must.equal("Signed In with Smart-ID")
					signedIn.headers.location.must.equal("/user")

					var cookies = parseCookies(signedIn.headers["set-cookie"])
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
						token: authentications[0].token,
						eid_session: new SmartIdSession("auth", SESSION_ID)
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

				it("must create session if session running once", function*() {
					var waited = 0

					var waiting = yield signInWithSmartId(
						this.router,
						this.request,
						function(req, res) {
							if (waited++ < 1) return void respond({
								state: "RUNNING"
							}, req, res)

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
									value: hashAndSignWithRsa(
										JOHN_RSA_KEYS.privateKey,
										token
									).toString("base64")
								}
							}, req, res)
						}
					)

					waiting.statusCode.must.equal(202)
					waiting.statusMessage.must.equal("Waiting for Smart-ID")
					waiting.headers["content-type"].must.equal(HTML_TYPE)

					var waitUrl = parseRefreshHeader(waiting.headers.refresh)[1]
					var signedIn = yield this.request(waitUrl)
					assertOk(signedIn)
					signedIn.headers.location.must.equal("/user")

					usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
				})

				it("must respond with error if CSRF token invalid", function*() {
					var waiting = yield signInWithSmartId(
						this.router,
						this.request,
						respond.bind(null, {state: "RUNNING"})
					)

					waiting.statusCode.must.equal(202)
					waiting.statusMessage.must.equal("Waiting for Smart-ID")
					waiting.headers["content-type"].must.equal(HTML_TYPE)

					var waitUrl = parseRefreshHeader(waiting.headers.refresh)[1]
					var res = yield this.request(waitUrl, {
						cookies: {csrf_token: pseudoHex(16)}
					})

					assertError(res, {
						code: 412,
						message: "Bad Query CSRF Token",
						description: t("create_session_page.errors.invalid_csrf_token")
					})

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})

				it("must respond with error given an already used authentication",
					function*() {
					var res = yield signInWithSmartId(
						this.router,
						this.request,
						SMART_ID_CERTIFICATE
					)

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Signed In with Smart-ID")

					var auth = usersDb.read(sql`SELECT * FROM authentications`)
					var user = usersDb.read(sql`SELECT * FROM users`)
					var session = sessionsDb.read(sql`SELECT * FROM sessions`)

					assertError(yield this.request(res.req.path), {
						code: 410,
						message: "Session Already Created",

						description:
							t("create_session_page.errors.authentication_already_used")
					})

					usersDb.search(sql`SELECT * FROM authentications`).must.eql([auth])
					usersDb.search(sql`SELECT * FROM users`).must.eql([user])
					sessionsDb.search(sql`SELECT * FROM sessions`).must.eql([session])
				})

				it("must respond with error given invalid personal id", function*() {
					var res = yield this.request("/sessions", {
						method: "POST",
						form: {method: "smart-id", "personal-id": "3870618666"}
					})

					assertError(res, {
						code: 422,
						message: "Invalid Personal Id",
						description: t("eid_view.errors.invalid_personal_id")
					})

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})

				_.each(PERSONAL_ID_TRANSFORMS, function(to, from) {
					it(`must transform Smart-ID personal id ${from} to ${to}`,
						function*() {
						var created = 0

						this.router.post(
							`${SMART_ID_URL.path}authentication/etsi/PNOEE-${to}`,
							function(req, res) {
							++created
							respond({sessionID: SESSION_ID}, req, res)
						})

						var res = yield this.request("/sessions", {
							method: "POST",
							form: {method: "smart-id", "personal-id": from}
						})

						created.must.equal(1)
						res.statusCode.must.equal(202)
						res.statusMessage.must.equal("Signing In with Smart-ID")
					})
				})
			})

			describe("when with JavaScript", function() {
				function assertOk(res) {
					res.statusCode.must.equal(200)
					res.statusMessage.must.equal("Authenticated with Smart-ID")
					res.headers["content-type"].must.equal(JSON_TYPE)
					res.body.must.eql({state: "DONE"})
				}

				function assertError(res, obj) {
					res.statusCode.must.equal(obj.code)
					res.statusMessage.must.equal(obj.message)
					res.headers["content-type"].must.equal(ERROR_TYPE)
					res.body.must.eql(obj)
				}

				mustSignIn(function*(router, request, cert, headers) {
					var res = yield signInWithSmartId(
						router,
						request,
						cert || SMART_ID_CERTIFICATE,
						_.defaults({Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}, headers)
					)

					if (!(res.statusCode >= 200 && res.statusCode < 300)) return res
					return request(res.headers.location)
				}, assertError)

				mustSignInWithSmartId((router, request, cert) => (
					signInWithSmartId(router, request, cert, {
						Accept: `${JSON_TYPE}, ${ERROR_TYPE}`
					})
				), assertOk, assertError)

				mustRateLimit((router, request) => (
					signInWithSmartId(router, request, SMART_ID_CERTIFICATE, {
						Accept: `${JSON_TYPE}, ${ERROR_TYPE}`
					})
				), assertOk, assertError)

				it("must create user and session", function*() {
					this.router.post(
						`${SMART_ID_URL.path}authentication/etsi/:id`,
						respond.bind(null, {sessionID: SESSION_ID})
					)

					this.router.get(`${SMART_ID_URL.path}session/:token`, (req, res) => {
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
								value: SMART_ID_CERTIFICATE.toString("base64"),
							},

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: hashAndSignWithRsa(
									JOHN_RSA_KEYS.privateKey,
									token
								).toString("base64")
							}
						}, req, res)
					})

					var authenticating = yield this.request("/sessions", {
						method: "POST",
						headers: {Accept: `${EMPTY_TYPE}, ${ERROR_TYPE}`},
						form: {method: "smart-id", "personal-id": PERSONAL_ID}
					})

					authenticating.statusCode.must.equal(202)
					authenticating.statusMessage.must.equal("Signing In with Smart-ID")
					authenticating.headers.must.not.have.property("content-type")

					var tokenHash = sha256(authenticationsDb.read(sql`
						SELECT token FROM authentications
						ORDER BY created_at DESC
						LIMIT 1
					`).token)

					authenticating.headers["x-verification-code"].must.equal(
						padVerificationCode(SmartId.verification(tokenHash))
					)

					var waitUrl = parseRefreshHeader(authenticating.headers.refresh)[1]
					var authenticated = yield this.request(waitUrl, {
						headers: {Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					})

					authenticated.statusCode.must.equal(200)
					authenticated.statusMessage.must.equal("Authenticated with Smart-ID")
					authenticated.headers.location.must.equal(waitUrl)
					authenticated.headers["content-type"].must.equal(JSON_TYPE)
					authenticated.body.must.eql({state: "DONE"})

					var signedIn = yield this.request(waitUrl)
					signedIn.statusCode.must.equal(303)
					signedIn.statusMessage.must.equal("Signed In with Smart-ID")
					signedIn.headers.location.must.equal("/user")

					var cookies = parseCookies(signedIn.headers["set-cookie"])
					var sessionToken = Buffer.from(cookies.session_token.value, "hex")
					var session = sessionsDb.read(sql`SELECT * FROM sessions`)
					session.token_sha256.must.eql(sha256(sessionToken))

					usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
				})

				it("must create session if session running once", function*() {
					var waited = 0

					var waiting = yield signInWithSmartId(
						this.router,
						this.request,
						function(req, res) {
							if (waited++ < 1) return void respond({
								state: "RUNNING"
							}, req, res)

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
									value: hashAndSignWithRsa(
										JOHN_RSA_KEYS.privateKey,
										token
									).toString("base64")
								}
							}, req, res)
						},
						{Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					)

					waiting.statusCode.must.equal(202)
					waiting.statusMessage.must.equal("Waiting for Smart-ID")
					waiting.headers["content-type"].must.equal(JSON_TYPE)
					waiting.body.must.eql({state: "PENDING"})

					var waitUrl = parseRefreshHeader(waiting.headers.refresh)[1]
					var authenticated = yield this.request(waitUrl, {
						headers: {Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					})

					assertOk(authenticated)

					var signedIn = yield this.request(authenticated.headers.location)
					signedIn.statusCode.must.equal(303)
					signedIn.statusMessage.must.equal("Signed In with Smart-ID")
					signedIn.headers.location.must.equal("/user")

					usersDb.search(sql`SELECT * FROM users`).must.not.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.not.be.empty()
				})

				it("must respond with error if CSRF token invalid", function*() {
					var waiting = yield signInWithSmartId(
						this.router,
						this.request,
						respond.bind(null, {state: "RUNNING"}),
						{Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					)

					waiting.statusCode.must.equal(202)
					waiting.statusMessage.must.equal("Waiting for Smart-ID")
					waiting.headers["content-type"].must.equal(JSON_TYPE)

					var waitUrl = parseRefreshHeader(waiting.headers.refresh)[1]
					var res = yield this.request(waitUrl, {
						cookies: {csrf_token: pseudoHex(16)},
						headers: {Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					})

					assertError(res, {
						code: 412,
						message: "Bad Query CSRF Token",
						description: t("create_session_page.errors.invalid_csrf_token")
					})

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})

				it("must respond with error given invalid personal id", function*() {
					var res = yield this.request("/sessions", {
						method: "POST",
						headers: {Accept: `${EMPTY_TYPE}, ${ERROR_TYPE}`},
						form: {method: "smart-id", "personal-id": "3870618666"}
					})

					assertError(res, {
						code: 422,
						message: "Invalid Personal Id",
						description: t("eid_view.errors.invalid_personal_id")
					})

					usersDb.search(sql`SELECT * FROM users`).must.be.empty()
					sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
				})
			})

			function mustSignInWithSmartId(signIn, assertOk, assertError) {
				describe("as a Smart-ID method", function() {
					_.each({
						RSA: [JOHN_RSA_KEYS, hashAndSignWithRsa],
						ECDSA: [JOHN_ECDSA_KEYS, hashAndSignWithEcdsa]
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

							assertOk(yield signIn(
								this.router,
								this.request,
								function(req, res) {
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
							))
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

							var res = yield signIn(
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

							assertError(res, {
								code: 410,
								message: "Invalid Smart-ID Signature",

								description:
									t("eid_view.smart_id_errors.auth_invalid_signature")
							})

							var authentication = authenticationsDb.read(sql`
								SELECT * FROM authentications
							`)

							authentication.certificate.must.eql(cert)
							usersDb.search(sql`SELECT * FROM users`).must.be.empty()
							sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
						})
					})

					it("must respond with error given invalid personal id from authentication start",
						function*() {
						this.router.post(
							`${SMART_ID_URL.path}authentication/etsi/:id`,
							function(_req, res) { res.statusCode = 404; res.end() }
						)

						var res = yield signIn(
							this.router,
							this.request,
							SMART_ID_CERTIFICATE
						)

						assertError(res, {
							code: 422,
							message: "Not a Smart-ID User",
							description: t("eid_view.smart_id_errors.not_found")
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
					})

					it("must respond with error given non-Estonian's certificate",
						function*() {
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

						assertError(yield signIn(this.router, this.request, cert), {
							code: 409,
							message: "Authentication Certificate Doesn't Match",

							description:
								t("eid_view.smart_id_errors.auth_certificate_mismatch")
						})
					})

					it("must respond with error given non-auth certificate", function*() {
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

						assertError(yield signIn(this.router, this.request, cert), {
							code: 422,
							message: "Not Authentication Certificate",
							description: t("eid_view.errors.certificate_not_for_auth")
						})
					})

					_.each(SMART_ID_ERRORS, ([
						statusCode,
						statusMessage,
						error
					], code) => it(`must respond with error given ${code}`, function*() {
						var res = yield signIn(
							this.router,
							this.request,

							respond.bind(null, {
								state: "COMPLETE",
								result: {endResult: code}
							})
						)

						assertError(res, {
							code: statusCode,
							message: statusMessage,
							description: t(error)
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
						})
					)

					it("must respond with error if session expired", function*() {
						var res = yield signIn(
							this.router,
							this.request,
							function(_req, res) { res.statusCode = 404; res.end() }
						)

						assertError(res, {
							code: 410,
							message: "Smart-ID Timeout",
							description: t("eid_view.smart_id_errors.auth_timeout")
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
					})

					it("must respond with error given Bad Request from authentication start", function*() {
						this.router.post(
							`${SMART_ID_URL.path}authentication/etsi/:id`,
							function(_req, res) { res.statusCode = 400; res.end() }
						)

						assertError(yield signIn(this.router, this.request, _.noop), {
							code: 500,
							message: "Unknown Smart-ID Error",
							description: t("500_BODY")
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
					})

					it("must respond with error given Bad Request from session",
						function*() {
						var res = yield signIn(
							this.router,
							this.request,
							function(_req, res) { res.statusCode = 400; res.end() }
						)

						assertError(res, {
							code: 500,
							message: "Unknown Smart-ID Error",
							description: t("500_BODY")
						})

						usersDb.search(sql`SELECT * FROM users`).must.be.empty()
						sessionsDb.search(sql`SELECT * FROM sessions`).must.be.empty()
					})
				})
			}
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
			res.statusMessage.must.equal("Signed Out")
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
			var auth = authenticationsDb.create(new ValidAuthentication({
				country: this.user.country,
				personal_id: this.user.personal_id
			}))

			var session = sessionsDb.create(new ValidSession({
				user_id: this.user.id,
				authentication_id: auth.id
			}))

			var res = yield this.request("/sessions/" + session.id, {
				method: "DELETE"
			})

			res.statusCode.must.equal(303)
			res.statusMessage.must.equal("Session Deleted")

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

		it("must redirect back to referrer without host", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "DELETE",
				headers: {Referer: "/initiatives"}
			})

			res.statusCode.must.equal(303)
			res.statusMessage.must.equal("Signed Out")
			res.headers.location.must.equal("/initiatives")
		})

		it("must redirect back to referrer on sam ehost", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "DELETE",
				headers: {Referer: this.url + "/initiatives"}
			})

			res.statusCode.must.equal(303)
			res.statusMessage.must.equal("Signed Out")
			res.headers.location.must.equal(this.url + "/initiatives")
		})

		;[
			"/user",
			"/user/signatures",
			"/user/subscriptions"
		].forEach(function(path) {
			it(`must redirect to home page if on ${path}`, function*() {
				var res = yield this.request("/sessions/" + this.session.id, {
					method: "DELETE",
					headers: {Referer: this.url + path}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Signed Out")
				res.headers.location.must.equal("/")
			})
		})

		SITE_URLS.forEach(function(url) {
			it(`must redirect back to ${Url.parse(url).hostname}`, function*() {
				var res = yield this.request("/sessions/" + this.session.id, {
					method: "DELETE",
					headers: {Referer: url + "/initiatives"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Signed Out")
				res.headers.location.must.equal(url + "/initiatives")
			})
		})

		it("must not redirect back to other hosts", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "DELETE",
				headers: {Referer: "http://example.com/evil"}
			})

			res.statusCode.must.equal(303)
			res.statusMessage.must.equal("Signed Out")
			res.headers.location.must.equal("/")
		})

		it("must not reset CSRF token", function*() {
			var res = yield this.request("/sessions/" + this.session.id, {
				method: "DELETE"
			})

			res.statusCode.must.equal(303)
			res.statusMessage.must.equal("Signed Out")

			var cookies = parseCookies(res.headers["set-cookie"])
			cookies.must.not.have.property("csrf_token")
		})

		it("must respond with error given other user's session", function*() {
			var user = usersDb.create(new ValidUser)

			var auth = authenticationsDb.create(new ValidAuthentication({
				country: this.user.country,
				personal_id: this.user.personal_id
			}))

			var session = sessionsDb.create(new ValidSession({
				user_id: user.id,
				authentication_id: auth.id
			}))

			var res = yield this.request("/sessions/" + session.id, {
				method: "DELETE"
			})

			res.statusCode.must.equal(404)
			res.statusMessage.must.equal("Session Not Found")
			sessionsDb.read(this.session).must.eql(this.session)
			sessionsDb.read(session).must.eql(session)
		})

		it("must respond with error given non-existent session", function*() {
			var res = yield this.request("/sessions/" + this.session.id + 1, {
				method: "DELETE"
			})

			res.statusCode.must.equal(404)
			res.statusMessage.must.equal("Session Not Found")
			sessionsDb.read(this.session).must.eql(this.session)
		})

		it("must respond with error given deleted session id", function*() {
			var auth = authenticationsDb.create(new ValidAuthentication({
				country: this.user.country,
				personal_id: this.user.personal_id
			}))

			var session = sessionsDb.create(new ValidSession({
				user_id: this.user.id,
				deleted_at: new Date,
				authentication_id: auth.id
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

function* signInWithMobileId(router, request, session, headers) {
	router.post(
		`${MOBILE_ID_URL.path}authentication`,
		respond.bind(null, {sessionID: SESSION_ID})
	)

	router.get(
		`${MOBILE_ID_URL.path}authentication/session/:token`,
		typeof session == "function" ? session : function(req, res) {
			var {token} = authenticationsDb.read(sql`
				SELECT token FROM authentications
				ORDER BY created_at DESC
				LIMIT 1
			`)

			respond({
				state: "COMPLETE",
				result: "OK",
				cert: session.toString("base64"),

				signature: {
					algorithm: "sha256WithRSAEncryption",
					value: hashAndSignWithRsa(
						JOHN_RSA_KEYS.privateKey,
						token
					).toString("base64")
				}
			}, req, res)
		}
	)

	var authenticating = yield request("/sessions", {
		method: "POST",
		headers: headers || {},

		form: {
			method: "mobile-id",
			"personal-id": PERSONAL_ID,
			"phone-number": "+37200000766"
		}
	})

	if (!(authenticating.statusCode >= 200 && authenticating.statusCode < 300))
		return authenticating

	authenticating.statusCode.must.equal(202)
	authenticating.statusMessage.must.equal("Signing In with Mobile-ID")

	return request(parseRefreshHeader(authenticating.headers.refresh)[1], {
		headers: headers || {}
	})
}

function* signInWithSmartId(router, request, session, headers) {
	router.post(
		`${SMART_ID_URL.path}authentication/etsi/:id`,
		respond.bind(null, {sessionID: SESSION_ID})
	)

	router.get(
		`${SMART_ID_URL.path}session/:token`,
		typeof session == "function" ? session : function(req, res) {
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
					value: session.toString("base64")
				},

				signature: {
					algorithm: "sha256WithRSAEncryption",
					value: hashAndSignWithRsa(
						JOHN_RSA_KEYS.privateKey,
						token
					).toString("base64")
				}
			}, req, res)
		}
	)

	var authenticating = yield request("/sessions", {
		method: "POST",
		headers: headers || {},
		form: {method: "smart-id", "personal-id": PERSONAL_ID}
	})

	if (!(authenticating.statusCode >= 200 && authenticating.statusCode < 300))
		return authenticating

	authenticating.statusCode.must.equal(202)
	authenticating.statusMessage.must.equal("Signing In with Smart-ID")

	return request(parseRefreshHeader(authenticating.headers.refresh)[1], {
		headers: headers || {}
	})
}

// Can't sign the hash directly unfortunately with Node.js.
function hashAndSignWithRsa(key, signable) {
	return Crypto.createSign("sha256").update(signable).sign(key)
}

function hashAndSignWithEcdsa(key, signable) {
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

function padVerificationCode(code) { return _.padLeft(code, 4, 0) }

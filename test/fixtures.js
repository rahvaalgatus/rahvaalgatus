var _ = require("root/lib/underscore")
var Fs = require("fs")
var Html = require("j6pack").Html
var Pem = require("undersign/lib/pem")
var Crypto = require("crypto")
var X509Asn = require("undersign/lib/x509_asn")
var OcspAsn = require("undersign/lib/ocsp_asn")
var Certificate = require("undersign/lib/certificate")
var Config = require("root/config")
var LdapAttributes = require("undersign/lib/ldap_attributes")
var ValidUser = require("root/test/valid_user")
var ValidSession = require("root/test/valid_session")
var newCitizenUser = require("root/test/citizenos_fixtures").newUser
var createCitizenUser = require("root/test/citizenos_fixtures").createUser
var usersDb = require("root/db/users_db")
var sessionsDb = require("root/db/sessions_db")
var pseudoHex = require("root/lib/crypto").pseudoHex
var sha1 = require("root/lib/crypto").hash.bind(null, "sha1")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var fetchDefaults = require("fetch-defaults")
var EMPTY_BUFFER = new Buffer(0)
var NO_PARAMS = Buffer.from("0500", "hex")
var nextSerialNumber = Math.floor(10000 * Math.random())

exports.JOHN_RSA_KEYS = readKeyPairSync(
	__dirname + "/fixtures/john_rsa.key",
	__dirname + "/fixtures/john_rsa.pub"
)

exports.JOHN_ECDSA_KEYS = readKeyPairSync(
	__dirname + "/fixtures/john_ecdsa.key",
	__dirname + "/fixtures/john_ecdsa.pub"
)

exports.ISSUER_KEYS = _.mapValues({
	"EID-SK 2007": "eid_2007_rsa",
	"ESTEID-SK 2011": "esteid_2011_rsa",
	"ESTEID-SK 2015": "esteid_2015_rsa",
	"ESTEID2018": "esteid_2018_ecdsa"
}, (path) => readKeyPairSync(
	__dirname + `/fixtures/${path}.key`,
	__dirname + `/fixtures/${path}.pub`
))

exports.PHONE_NUMBER_TRANSFORMS = {
	"0001337": "+3720001337",
	"5031337": "+3725031337",
	"500 1337": "+3725001337",
	"3580031337": "+3580031337",
	"3700031337": "+3700031337",
	"3710031337": "+3710031337",
	"3720031337": "+3720031337",
	"+3580031337": "+3580031337",
	"+3700031337": "+3700031337",
	"+3710031337": "+3710031337",
	"+3720031337": "+3720031337",
	"(+372) 5031337": "+3725031337",
	"(372) 5031337": "+3725031337",
	"[372] 5031337": "+3725031337",
	"372-500-1337": "+3725001337"
}

exports.MOBILE_ID_CREATE_ERRORS = {
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

exports.MOBILE_ID_SESSION_ERRORS = {
	TIMEOUT: [
		410,
		"Mobile-Id Timeout",
		"MOBILE_ID_ERROR_TIMEOUT"
	],

	NOT_MID_CLIENT: [
		410,
		"Mobile-Id Certificates Not Activated",
		"MOBILE_ID_ERROR_NOT_ACTIVE"
	],

	USER_CANCELLED: [
		410,
		"Mobile-Id Cancelled",
		"MOBILE_ID_ERROR_USER_CANCELLED"
	],

	SIGNATURE_HASH_MISMATCH: [
		410,
		"Mobile-Id Signature Hash Mismatch",
		"MOBILE_ID_ERROR_SIGNATURE_HASH_MISMATCH"
	],

	PHONE_ABSENT: [
		410,
		"Mobile-Id Phone Absent",
		"MOBILE_ID_ERROR_PHONE_ABSENT"
	],

	DELIVERY_ERROR: [
		410,
		"Mobile-Id Delivery Error",
		"MOBILE_ID_ERROR_DELIVERY_ERROR"
	],

	SIM_ERROR: [
		410,
		"Mobile-Id SIM Application Error",
		"MOBILE_ID_ERROR_SIM_ERROR"
	],
}

// Load TSL only after setting ISSUER_KEYS as they're used for setting the
// public keys.
var tsl = require("root").tsl

// EID-SK 2007 expired 2016-08-26T14:23:01.000Z,
// ESTEID-SK 2007 expired 2016-08-26T14:23:01.000Z.
exports.VALID_ISSUERS = [[
	"C=EE",
	"O=AS Sertifitseerimiskeskus",
	"CN=ESTEID-SK 2011",
	"1.2.840.113549.1.9.1=#1609706b6940736b2e6565"
], [
	"C=EE",
	"O=AS Sertifitseerimiskeskus",
	"2.5.4.97=#0c0e4e545245452d3130373437303133",
	"CN=ESTEID-SK 2015"
], [
	"C=EE",
	"O=SK ID Solutions AS",
	"2.5.4.97=#0c0e4e545245452d3130373437303133",
	"CN=ESTEID2018"
]].map((parts) => parts.join(",")).map(tsl.getBySubjectName.bind(tsl))

// TODO: Add the CSRF token to the header by default.
exports.csrf = function() {
	beforeEach(function() {
		this.csrfToken = pseudoHex(16)

		this.request = fetchDefaults(this.request, {
			cookies: {csrf_token: this.csrfToken}
		})
	})
}

exports.csrfRequest = function() {
	beforeEach(function() {
		this.csrfToken = pseudoHex(16)

		this.request = fetchDefaults(this.request, {
			headers: {"X-CSRF-Token": this.csrfToken},
			cookies: {csrf_token: this.csrfToken}
		})
	})
}

exports.createUser = function*(attrs) {
	var user = yield usersDb.create(new ValidUser(attrs))

	yield createCitizenUser(newCitizenUser({
		id: user.uuid.toString("hex"),
		name: user.name
	}))

	return user
}

exports.user = function(attrs) {
	beforeEach(function*() {
		var user = yield exports.createUser(attrs)
		var token = Crypto.randomBytes(12)
		this.user = user

		this.session = yield sessionsDb.create(new ValidSession({
			user_id: user.id,
			token_sha256: sha256(token)
		}))

		// https://github.com/mochajs/mocha/issues/2014:
		delete this.request

		this.request = fetchDefaults(this.request, {
			cookies: {[Config.sessionCookieName]: token.toString("hex")}
		})
	})
}

exports.respond = respond

exports.newCertificate = function(opts) {
	var issuer = opts && opts.issuer

	var publicKey = opts && opts.publicKey && (typeof opts.publicKey == "string"
		? X509Asn.SubjectPublicKeyInfo.decode(Pem.parse(opts.publicKey))
		: opts.publicKey
	) || {
		algorithm: {algorithm: X509Asn.RSA, parameters: NO_PARAMS},
		subjectPublicKey: {unused: 0, data: EMPTY_BUFFER}
	}

	var validFrom = opts && opts.validFrom || new Date(2000, 0, 1)
	var validUntil = opts && opts.validUntil || new Date(2030, 0, 1)

	var signatureAlgorithm = issuer instanceof Certificate
		? hashAlgorithm(issuer.asn.tbsCertificate.subjectPublicKeyInfo.algorithm)
		: {algorithm: X509Asn.RSA_SHA256, parameters: NO_PARAMS}

	var unsignedCertificate = {
		serialNumber: nextSerialNumber++,
		signature: signatureAlgorithm,
		subject: serializeSubjectName(opts && opts.subject || Object),
		issuer: serializeSubjectName(issuer || Object),

		validity: {
			notBefore: {type: "utcTime", value: validFrom},
			notAfter: {type: "utcTime", value: validUntil},
		},

		subjectPublicKeyInfo: publicKey
	}

	var signature = EMPTY_BUFFER

	if (issuer instanceof Certificate) {
		var commonName = _.merge({}, ...issuer.subject).commonName
		var keys = exports.ISSUER_KEYS[commonName]
		if (keys == null) throw new Error("No keys for " + commonName)

		var der = X509Asn.TBSCertificate.encode(unsignedCertificate)
		var signer = Crypto.createSign("sha256")
		signature = signer.update(der).sign(keys.privateKey)
	}

	return X509Asn.Certificate.encode({
		tbsCertificate: unsignedCertificate,
		signatureAlgorithm: signatureAlgorithm,
		signature: {unused: 0, data: signature}
	})
}

exports.newOcspResponse = function(certificate) {
	return OcspAsn.OCSPResponse.encode({
		responseStatus: "successful",

		responseBytes: {
			responseType: "id-pkix-ocsp-basic",

			response: OcspAsn.BasicOCSPResponse.encode({
				tbsResponseData: {
					responderID: {
						type: "byName",
						value: {type: "rdnSequence", value: []}
					},

					producedAt: new Date,

					responses: [{
						certId: {
							hashAlgorithm: {algorithm: X509Asn.SHA1},
							serialNumber: certificate.serialNumber,
							issuerNameHash: sha1(certificate.issuerDer),
							issuerKeyHash: sha1("")
						},

						certStatus: {type: "good", value: null},
						thisUpdate: new Date(2015, 5, 18, 13, 37, 42),
						singleExtensions: []
					}]
				},

				signatureAlgorithm: {
					algorithm: X509Asn.RSA,
					parameters: EMPTY_BUFFER
				},

				signature: {unused: 0, data: EMPTY_BUFFER}
			})
		}
	})
}

function serializeSubjectName(names) {
	if (names instanceof Certificate) return names.asn.tbsCertificate.subject
	if (Buffer.isBuffer(names)) return X509Asn.Name.decode(names)
	if (Array.isArray(names)) names = _.merge({}, ...names)
	
	return {type: "rdnSequence", value: _.map(names, function(value, name) {
		if (!LdapAttributes.has(name)) throw new Error("Unsupported name: " + name)

		return [{
			type: LdapAttributes.get(name).oid,
			value: LdapAttributes.serialize(name, value)
		}]
	})}
}

function respond(body, _req, res) {
	var type = typeof body == "string" || body instanceof Html
		? "text/html"
		: "application/json"

	res.writeHead(res.statusCode, {"Content-Type": type})
	res.end(type == "text/html" ? String(body) : JSON.stringify(body))
}

function readKeyPairSync(keyPath, pubPath) {
	return {
		privateKey: Fs.readFileSync(keyPath, "utf8"),
		publicKey: Fs.readFileSync(pubPath, "utf8")
	}
}

function hashAlgorithm(algorithm) {
	var oid = algorithm.algorithm, oidWithHash
	if (_.deepEquals(oid, X509Asn.RSA)) oidWithHash = X509Asn.RSA_SHA256
	else if (_.deepEquals(oid, X509Asn.ECDSA)) oidWithHash = X509Asn.ECDSA_SHA256
	else throw new RangeError("Unsupported algorithm: " + oid.join("."))
	return {algorithm: oidWithHash, parameters: algorithm.parameters}
}

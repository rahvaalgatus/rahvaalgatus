var _ = require("root/lib/underscore")
var Fs = require("fs")
var {Html} = require("j6pack")
var Pem = require("undersign/lib/pem")
var Crypto = require("crypto")
var X509Asn = require("undersign/lib/x509_asn")
var OcspAsn = require("undersign/lib/ocsp_asn")
var TimestampAsn = require("undersign/lib/timestamp_asn")
var {SIGNED_DATA_OID} = TimestampAsn
var Certificate = require("undersign/lib/certificate")
var Config = require("root").config
var LdapAttributes = require("undersign/lib/ldap_attributes")
var ValidUser = require("root/test/valid_user")
var ValidSession = require("root/test/valid_session")
var ValidAuthentication = require("root/test/valid_authentication")
var usersDb = require("root/db/users_db")
var authenticationsDb = require("root/db/authentications_db")
var sessionsDb = require("root/db/sessions_db")
var {pseudoHex} = require("root/lib/crypto")
var {serializePersonalId} = require("root/lib/user")
var sha1 = require("root/lib/crypto").hash.bind(null, "sha1")
var fetchDefaults = require("fetch-defaults")
var EMPTY_BUFFER = Buffer.alloc(0)
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
	"ESTEID2018": "esteid_2018_ecdsa",
	"EID-SK 2016": "eid_2016_rsa"
}, (path) => readKeyPairSync(
	__dirname + `/fixtures/${path}.key`,
	__dirname + `/fixtures/${path}.pub`
))

exports.SITE_URLS = [
	Config.url,
	Config.parliamentSiteUrl,
	Config.localSiteUrl
]

exports.PERSONAL_ID_TRANSFORMS = {
	"38706181337": "38706181337",
	"3 87 06 18 1337": "38706181337",
	"3\t8706181337": "38706181337"
}

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

// Load TSL only after setting ISSUER_KEYS as they're used for setting the
// public keys.
var {tsl} = require("root")

// EID-SK 2007 expired 2016-08-26T14:23:01.000Z,
// ESTEID-SK 2007 expired 2016-08-26T14:23:01.000Z.
exports.VALID_ISSUERS = Config.issuers
	.map((parts) => parts.join(","))
	.map(tsl.getBySubjectName.bind(tsl))
	.filter(Boolean)

var request = require("root/lib/fetch")
request = require("root/lib/fetch/fetch_cook")(request)
request = fetchSession(request)

request = require("fetch-parse")(request, {
	"text/html": true,
	"text/csv": true,
	"text/plain": true,
	"image/*": parseBuffer,
	"application/zip": parseBuffer,
	"application/vnd.etsi.asic-e+zip": parseBuffer,
	"application/vnd.rahvaalgatus.signable": parseBuffer,
	json: true,
	xml: true
})

request = require("root/lib/fetch/fetch_nodeify")(request)
exports.request = request

exports.csrf = function() {
	beforeEach(function() {
		this.csrfToken = pseudoHex(16)

		this.request = fetchDefaults(this.request, {
			headers: {"X-CSRF-Token": this.csrfToken},
			cookies: {csrf_token: this.csrfToken}
		})
	})
}

exports.user = function(attrs) {
	beforeEach(function() {
		var user = usersDb.create(new ValidUser(attrs))

		var auth = authenticationsDb.create(new ValidAuthentication({
			country: user.country,
			personal_id: user.personal_id
		}))

		var session = new ValidSession({
			user_id: user.id,
			authentication_id: auth.id
		})

		session = _.assign(sessionsDb.create(session), {token: session.token})

		this.user = user
		this.session = session

		// https://github.com/mochajs/mocha/issues/2014:
		delete this.request
		this.request = fetchDefaults(this.request, {session: session})
	})
}

exports.admin = function(attrs) {
	var country = attrs && attrs.country || "EE"
	var personalId = attrs && attrs.personal_id || ValidUser.randomPersonalId()
	var perms = attrs && attrs.permissions || []
	exports.user({country, personal_id: personalId})

	beforeEach(function() {
		Config.admins = {
			[serializePersonalId({country, personal_id: personalId})]: perms
		}
	})

	afterEach(function() { Config.admins = {} })
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
		extensions: opts.extensions,
		subjectPublicKeyInfo: publicKey,

		validity: {
			notBefore: {type: "utcTime", value: validFrom},
			notAfter: {type: "utcTime", value: validUntil}
		}
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

exports.newTimestampResponse = function() {
	return TimestampAsn.TimestampResponse.encode({
		status: {status: "granted", statusString: ["Operation Okay"]},
		timeStampToken: {
			contentType: SIGNED_DATA_OID,
			content: TimestampAsn.SignedData.encode(Buffer.from("xyz"))
		}
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

				signatureAlgorithm: {algorithm: X509Asn.RSA, parameters: EMPTY_BUFFER},
				signature: {unused: 0, data: EMPTY_BUFFER}
			})
		}
	})
}

var BLOCK_BREAK = {
	"type": "string",
	"attributes": {"blockBreak": true},
	"string": "\n"
}

exports.newTrixDocument = function(text) {
	return [{
		"text": [{"type": "string", "attributes": {}, "string": text}, BLOCK_BREAK],
		"attributes": []
	}]
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

function fetchSession(fetch) {
	return _.assign(function(url, opts) {
		var session = opts && opts.session

		if (session) {
			if (opts.cookies == null) opts.cookies = {}
			opts.cookies[Config.sessionCookieName] = session.token.toString("hex")
		}

		return fetch(url, opts)
	}, fetch)
}

function parseBuffer(res) { return res.arrayBuffer().then(Buffer.from) }

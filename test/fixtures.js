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
var newUser = require("root/test/citizenos_fixtures").newUser
var createUser = require("root/test/citizenos_fixtures").createUser
var pseudoHex = require("root/lib/crypto").pseudoHex
var sha1 = require("root/lib/crypto").hash.bind(null, "sha1")
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

exports.user = function(attrs) {
	beforeEach(function*() {
		// https://github.com/mochajs/mocha/issues/2014:
		delete this.request

		this.user = yield createUser(newUser(attrs))

		this.request = fetchDefaults(this.request, {
			cookies: {[Config.cookieName]: pseudoHex(16)}
		})

		this.router.get("/api/auth/status", respond.bind(null, {data: {
			id: this.user.id,
			name: this.user.name,
			email: this.user.email
		}}))
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

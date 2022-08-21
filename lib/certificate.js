var _ = require("./underscore")
var Config = require("root").config
var HttpError = require("standard-http-error")
var tsl = require("root").tsl
var SSL_CLIENT_AUTH_OID = [1, 3, 6, 1, 5, 5, 7, 3, 2]

var VALID_ISSUERS = Config.issuers.map((p) => p.join(","))
VALID_ISSUERS = VALID_ISSUERS.map(tsl.getBySubjectName.bind(tsl))

exports.getCertificatePersonalId = function(cert) {
	var obj = _.assign({}, ...cert.subject), pno

	if (pno = /^PNO([A-Z][A-Z])-(\d+)$/.exec(obj.serialNumber))
		return [pno[1], pno[2]]
	else
		return [obj.countryName, obj.serialNumber]
}

exports.getCertificatePersonName = function(cert) {
	var obj = _.assign({}, ...cert.subject)
	return capitalizeName(obj.givenName + " " + obj.surname)
}

exports.validateCertificate = function(t, cert) {
	// Undersign's Certificates.prototype.getIssuer confirms the cert was also
	// signed by the issuer.
	var issuer = tsl.getIssuer(cert)

	if (!VALID_ISSUERS.includes(issuer))
		return new HttpError(422, "Invalid Issuer", {
			description: t("INVALID_CERTIFICATE_ISSUER")
		})

	if (cert.validFrom > new Date)
		return new HttpError(422, "Certificate Not Yet Valid", {
			description: t("CERTIFICATE_NOT_YET_VALID")
		})

	if (cert.validUntil <= new Date)
		return new HttpError(422, "Certificate Expired", {
			description: t("CERTIFICATE_EXPIRED")
		})

	return null
}

exports.validateAuthenticationCertificate = function(t, cert) {
	var err = exports.validateCertificate(t, cert)
	if (err) return err

	var extensions = cert.asn.tbsCertificate.extensions || []
	var usage = getKeyUsageExtension(extensions) || []

	if (!usage.some(_.deepEquals.bind(null, SSL_CLIENT_AUTH_OID)))
		throw new HttpError(422, "Not Authentication Certificate", {
			description: t("CERTIFICATE_NOT_FOR_AUTH")
		})

	return null
}

function getKeyUsageExtension(extensions) {
	var ext = extensions.find((e) => e.extnID == "extendedKeyUsage")
	if (ext == null) return null
	return ext.extnValue
}

function capitalizeName(name) {
	return name.toLowerCase().replace(/((?:^|[-_ '’]).)/gu, (char) => (
		char.toUpperCase()
	))
}

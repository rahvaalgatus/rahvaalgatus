var _ = require("./underscore")
var Config = require("root").config
var HttpError = require("standard-http-error")
var {tsl} = require("root")
var SSL_CLIENT_AUTH_OID = [1, 3, 6, 1, 5, 5, 7, 3, 2]
var KEY_USAGE_DIGITAL_SIGNATURE = 128
var KEY_USAGE_NON_REPUDATION = 64

var VALID_ISSUERS = Config.issuers
	.map((parts) => parts.join(","))
	.map(tsl.getBySubjectName.bind(tsl))
	.filter(Boolean)

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

exports.validateAuthenticationCertificate = function(t, cert) {
	var err = validateCertificate(t, cert)
	if (err) return err

	var extensions = cert.asn.tbsCertificate.extensions || []
	var usage = getKeyUsage(extensions) || 0

	// NOTE: The ASN.1 bit string is parsed into a variable length buffer with the
	// significant bit (128) matching bit 0 from the RFC.
	// https://datatracker.ietf.org/doc/html/rfc2459#section-4.2.1.3
	if (!(usage & KEY_USAGE_DIGITAL_SIGNATURE))
		throw new HttpError(422, "Not Authentication Certificate", {
			description: t("eid_view.errors.certificate_not_for_auth")
		})

	return null
}

exports.validateIdCardAuthenticationCertificate = function(t, cert) {
	var err = exports.validateAuthenticationCertificate(t, cert)
	if (err) return err

	var extensions = cert.asn.tbsCertificate.extensions || []
	var extendedUsage = getExtendedKeyUsage(extensions) || []

	if (!extendedUsage.some(_.deepEquals.bind(null, SSL_CLIENT_AUTH_OID)))
		throw new HttpError(422, "Not ID-card Authentication Certificate", {
			description: t("eid_view.errors.certificate_not_for_auth")
		})

	return null
}

exports.validateSigningCertificate = function(t, cert) {
	var err = validateCertificate(t, cert)
	if (err) return err

	var extensions = cert.asn.tbsCertificate.extensions || []
	var usage = getKeyUsage(extensions) || 0

	if (!(usage & KEY_USAGE_NON_REPUDATION))
		throw new HttpError(422, "Not Signing Certificate", {
			description: t("eid_view.errors.certificate_not_for_sign")
		})

	return null
}

function validateCertificate(t, cert) {
	// Undersign's Certificates.prototype.getIssuer confirms the cert was also
	// signed by the issuer.
	var issuer = tsl.getIssuer(cert)

	if (!VALID_ISSUERS.includes(issuer))
		return new HttpError(422, "Invalid Issuer", {
			description: t("eid_view.errors.invalid_issuer")
		})

	if (cert.validFrom > new Date)
		return new HttpError(422, "Certificate Not Yet Valid", {
			description: t("eid_view.errors.certificate_not_yet_valid")
		})

	if (cert.validUntil <= new Date)
		return new HttpError(422, "Certificate Expired", {
			description: t("eid_view.errors.certificate_expired")
		})

	return null
}

function getKeyUsage(extensions) {
	var ext = extensions.find((e) => e.extnID == "keyUsage")
	if (ext == null) return null
	return ext.extnValue.data[0]
}

function getExtendedKeyUsage(extensions) {
	var ext = extensions.find((e) => e.extnID == "extendedKeyUsage")
	if (ext == null) return null
	return ext.extnValue
}

function capitalizeName(name) {
	return name.toLowerCase().replace(/((?:^|[-_ '’]).)/gu, (char) => (
		char.toUpperCase()
	))
}

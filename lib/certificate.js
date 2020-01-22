var _ = require("./underscore")
var Config = require("root/config")
var HttpError = require("standard-http-error")
var tsl = require("root").tsl

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

function capitalizeName(name) {
	return name.toLowerCase().replace(/((?:^|[-_ '’]).)/gu, (char) => (
		char.toUpperCase()
	))
}

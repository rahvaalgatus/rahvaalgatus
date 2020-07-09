var _ = require("root/lib/underscore")
var Xades = require("undersign/xades")
var Certificate = require("undersign/lib/certificate")
var newCertificate = require("root/test/fixtures").newCertificate
var {randomPersonalId} = require("./valid_user")

var xades = Xades.parse(String(new Xades(new Certificate(newCertificate({
	subject: {countryName: "EE"},
	issuer: {countryName: "EE"}
})), [])))

xades.setSignature(Buffer.from("foo"))

module.exports = function(attrs) {
	var createdAt = new Date
	var country = attrs && attrs.country || "EE"
	var personalId = attrs && attrs.personal_id || randomPersonalId()

	return _.assign({
		created_at: createdAt,
		updated_at: createdAt,
		country: country,
		personal_id: personalId,
		method: "id-card",
		signable: "I confirm the translation!",
		signable_type: "text/plain",
		xades: xades,
		error: null
	}, attrs)
}

var _ = require("root/lib/underscore")
var Crypto = require("crypto")
var Xades = require("undersign/xades")
var Certificate = require("undersign/lib/certificate")
var {newCertificate} = require("root/test/fixtures")
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
		created_from: null,
		updated_at: createdAt,
		country: country,
		personal_id: personalId,
		token: Crypto.randomBytes(12),
		method: "id-card",
		eid_session: null,
		signed: false,
		timestamped: false,
		xades: xades,
		error: null
	}, attrs)
}

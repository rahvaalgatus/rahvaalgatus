var ERR_PREFIX = "MSG_ERROR_HWCRYPTO_"
void require("./vendor/hwcrypto-legacy.js")
var Hwcrypto = require("./vendor/hwcrypto.js")

exports.authenticate = function() {
	var cert = Hwcrypto.getCertificate({})
	cert = cert.then(function(cert) { return cert.hex })
	cert = cert.catch(errorify)
	return cert
}

exports.sign = function(cert, hash, data) {
	var sig = Hwcrypto.sign({hex: cert}, {hex: data, type: hash}, {})
	sig = sig.then(function(sig) { return sig.hex })
	sig = sig.catch(errorify)
	return sig
}

function errorify(err) {
	err.code = identifyError(err)
	throw err
}

function identifyError(err) {
	switch (err.message) {
		case Hwcrypto.NO_CERTIFICATES:
		case Hwcrypto.USER_CANCEL:
		case Hwcrypto.NO_IMPLEMENTATION:
			return ERR_PREFIX + err.message.toUpperCase()

		case Hwcrypto.INVALID_ARGUMENT:
		case Hwcrypto.NOT_ALLOWED:
		case Hwcrypto.TECHNICAL_ERROR:
		default:
			return ERR_PREFIX + "TECHNICAL_ERROR"
	}
};

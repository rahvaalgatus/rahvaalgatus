var ERR_PREFIX = "MSG_ERROR_HWCRYPTO_"
void require("./vendor/hwcrypto-legacy.js")
var Hwcrypto = require("./vendor/hwcrypto.js")
exports.Certificate = Certificate

function Certificate(cert) {
	this.obj = cert
}

Certificate.prototype.toDer = function() {
	return this.obj.encoded
}

Certificate.prototype.toHwcrypto = function() {
	return this.obj
}

exports.certificate = function() {
	var cert = Hwcrypto.getCertificate({})
	cert = cert.then(function(cert) { return new Certificate(cert) })
	cert = cert.catch(errorify)
	return cert
}

exports.sign = function(cert, hashName, hash) {
	var sig = Hwcrypto.sign(cert.toHwcrypto(), {value: hash, type: hashName}, {})
	sig = sig.then(function(sig) { return sig.value })
	sig = sig.catch(errorify)
	return sig
}

function errorify(err) {
	err.code = identifyError(err)
	throw err
}

function identifyError(err) {
	switch (err.message) {
		case Hwcrypto.NOT_ALLOWED:
		case Hwcrypto.NO_CERTIFICATES:
		case Hwcrypto.USER_CANCEL:
		case Hwcrypto.NO_IMPLEMENTATION:
			return ERR_PREFIX + err.message.toUpperCase()

		case Hwcrypto.INVALID_ARGUMENT:
		case Hwcrypto.TECHNICAL_ERROR:
		default: return ERR_PREFIX + "TECHNICAL_ERROR"
	}
}

void require("./vendor/hwcrypto-legacy.js")
var Hwcrypto = require("./vendor/hwcrypto.js")
exports.Certificate = Certificate
exports.Hwcrypto = Hwcrypto // Export for testing.

function Certificate(cert) {
	this.obj = cert
}

Certificate.prototype.toDer = function() {
	return this.obj.encoded
}

Certificate.prototype.toHwcrypto = function() {
	return this.obj
}

exports.certificate = function(type) {
	// https://github.com/open-eid/chrome-token-signing/blob/0fc224ce43540d2f4198b2e5315e9d37ad7bbe00/host-windows/chrome-token-signing.cpp
	var cert = Hwcrypto.getCertificate({filter: type && type.toUpperCase()})
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
		case Hwcrypto.NO_IMPLEMENTATION: return err.message.toUpperCase()

		case Hwcrypto.INVALID_ARGUMENT:
		case Hwcrypto.TECHNICAL_ERROR:
		default: return "TECHNICAL_ERROR"
	}
}

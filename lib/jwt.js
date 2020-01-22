var _ = require("./underscore")
var Crypto = require("crypto")

exports.sign = function(algorithm, key, validity, obj) {
	obj = _.clone(obj)

	obj.iat = Math.floor(Date.now() / 1000)
	obj.exp = Math.floor(Date.now() / 1000 + validity)

	var header = encode64(JSON.stringify({typ: "JWT", alg: algorithm}))
	var body = encode64(JSON.stringify(obj))
	var signature = encode64(sign(algorithm, key, header + "." + body))
	return header + "." + body + "." + signature
}

function encode64(value) {
	var base64 = new Buffer(value).toString("base64")
	base64 = base64.replace(/=/g, "")
	base64 = base64.replace(/\+/g, "-")
	base64 = base64.replace(/\//g, "_")
	return base64
}

function sign(algorithm, key, data) {
	var signer

	switch (algorithm) {
		case "HS256":
			signer = Crypto.createHmac("SHA256", key)
			signer.update(data)
			return signer.digest(key)

		case "RS256":
			signer = Crypto.createSign("RSA-SHA256")
			signer.update(data)
			return signer.sign(key)

		default: throw new RangeError("Unsupported algorithm: " + algorithm)
	}
}

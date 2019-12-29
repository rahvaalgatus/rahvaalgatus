var Crypto = require("crypto")
var Hash = Crypto.Hash

exports.randomHex = randomHex
exports.pseudoHex = randomHex
exports.pseudoInt = pseudoInt
exports.pseudoDateTime = pseudoDateTime
exports.md5 = md5
exports.encodeBase64 = encode64
exports.decodeBase64 = decode64

exports.constantTimeEqual = function(a, b) {
	return a.length == b.length && Crypto.timingSafeEqual(a, b)
}

exports.hash = function(hash, data) {
	return new Hash(hash).update(data).digest()
}

function decode64(value) {
	return new Buffer(String(value), "base64").toString()
}

function randomHex(n) { return Crypto.randomBytes(n).toString("hex") }
function pseudoInt(max) { return Math.round(Math.random() * max) }
function md5(bytes) { return new Hash("md5").update(bytes).digest("hex") }
function encode64(value) { return new Buffer(String(value)).toString("base64") }
function pseudoDateTime() { return new Date(Date.now() * Math.random()) }

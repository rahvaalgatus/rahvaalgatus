var Crypto = require("crypto")
var Hash = Crypto.Hash

exports.pseudoHex = randomHex
exports.pseudoInt = pseudoInt
exports.pseudoDateTime = pseudoDateTime

exports.constantTimeEqual = function(a, b) {
	// The same-length precondition comes from Node.js's documentation.
	return a.length == b.length && Crypto.timingSafeEqual(a, b)
}

exports.hash = function(hash, data) {
	return new Hash(hash).update(data).digest()
}

function randomHex(n) { return Crypto.randomBytes(n).toString("hex") }
function pseudoInt(max) { return Math.round(Math.random() * max) }
function pseudoDateTime() { return new Date(Date.now() * Math.random()) }

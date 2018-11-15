var Crypto = require("crypto")
var Hash = Crypto.Hash

exports.randomHex = randomHex
exports.pseudoHex = randomHex
exports.pseudoInt = pseudoInt
exports.md5 = md5

function randomHex(n) { return Crypto.randomBytes(n).toString("hex") }
function pseudoInt(max) { return Math.round(Math.random() * max) }
function md5(bytes) { return new Hash("md5").update(bytes).digest("hex") }

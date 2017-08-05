var Crypto = require("crypto")

exports.randomHex = randomHex
exports.pseudoHex = randomHex
exports.pseudoInt = pseudoInt

function randomHex(n) { return Crypto.randomBytes(n).toString("hex") }
function pseudoInt(max) { return Math.round(Math.random() * max) }

var {Mime} = require("mime")
exports = module.exports = new Mime

exports.define(require("mime/types.json"))
exports.define({"application/vnd.etsi.asic-e+zip": ["asice", "bdoc"]})

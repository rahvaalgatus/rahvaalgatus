var _ = require("lodash")

exports.first = _.first
exports.zip = _.zip
exports.compose = _.flowRight
exports.escape = _.escape
exports.template = _.template
exports.once = _.once
exports.third = function(array) { return array[2] }

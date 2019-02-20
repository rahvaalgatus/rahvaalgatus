var _ = require("lodash")

exports.zip = _.zip
exports.compose = _.flowRight
exports.escape = _.escape
exports.template = _.template
exports.once = _.once
exports.first = function(array) { return array[0] }
exports.second = function(array) { return array[1] }
exports.third = function(array) { return array[2] }

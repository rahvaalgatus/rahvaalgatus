var _ = require("lodash")
var O = require("oolong")

exports.isEmpty = O.isEmpty
exports.assign = O.assign
exports.zip = _.zip
exports.compose = _.flowRight
exports.escape = _.escape
exports.template = _.template
exports.contains = _.includes
exports.once = _.once
exports.indexBy = _.keyBy
exports.first = function(array) { return array[0] }
exports.second = function(array) { return array[1] }
exports.third = function(array) { return array[2] }

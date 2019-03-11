var _ = require("lodash")
var O = require("oolong")

exports.isEmpty = O.isEmpty
exports.assign = O.assign
exports.zip = _.zip
exports.difference = _.difference
exports.compose = _.flowRight
exports.escape = _.escape
exports.reject = _.reject
exports.template = _.template
exports.contains = _.includes
exports.once = _.once
exports.mapValues = O.map
exports.indexBy = _.keyBy
exports.sortBy = _.sortBy
exports.groupBy = _.groupBy
exports.first = function(array) { return array[0] }
exports.second = function(array) { return array[1] }
exports.third = function(array) { return array[2] }

exports.parseTrilean = function(input) {
  if (input == null) return null
  if (typeof input != "string") return !!input

  switch (input.toLowerCase()) {
    case "1":
    case "on":
    case "t":
    case "true":
    case "y":
    case "yes":
      return true

    case "":
    case "any":
    case "both":
    case "maybe":
    case "null":
    case "undefined":
      return null

    default:
      return false
  }
}

var _ = require("lodash")
var O = require("oolong")

exports.create = O.create
exports.clone = O.clone
exports.isEmpty = O.isEmpty
exports.defaults = O.defaults
exports.assign = O.assign
exports.object = O.object
exports.merge = O.merge
exports.zip = _.zip
exports.difference = _.difference
exports.chunk = _.chunk
exports.compose = _.flowRight
exports.reject = _.reject
exports.template = _.template
exports.contains = _.includes
exports.once = _.once
exports.map = _.map
exports.mapValues = O.map
exports.each = O.each
exports.values = O.values
exports.indexBy = _.keyBy
exports.keys = O.keys
exports.uniq = _.uniq
exports.uniqueId = _.uniqueId
exports.sortBy = _.sortBy
exports.groupBy = _.groupBy
exports.fromEntries = _.fromPairs
exports.times = _.times
exports.first = function(array) { return array[0] }
exports.second = function(array) { return array[1] }
exports.third = function(array) { return array[2] }
exports.last = function(array) { return array[array.length - 1] }
exports.reverse = function(array) { return array.slice().reverse() }
exports.isValidEmail = function(email) { return email.indexOf("@") >= 0 }

exports.escapeHtml = function(text) {
	text = text.replace(/&/g, "&amp;")
	text = text.replace(/</g, "&lt;")
	text = text.replace(/>/g, "&gt;")
	return text
}

exports.quoteEmail = function(text) {
	return text.replace(/\r\n/g, "\n").replace(/^/gm, "> ")
}

exports.parseBoolean = function(input) {
  if (typeof input != "string") return !!input

  switch (input.toLowerCase()) {
    case "1":
    case "on":
    case "t":
    case "true":
    case "y":
    case "yes":
      return true

    default:
      return false
  }
}

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

var _ = require("lodash")
var O = require("oolong")
var concat = Array.prototype.concat.bind(Array.prototype)

exports.id = function(value) { return value }
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
exports.filterValues = O.filter
exports.each = O.each
exports.values = O.values
exports.indexBy = _.keyBy
exports.keys = O.keys
exports.uniq = _.uniq
exports.uniqBy = _.uniqBy
exports.partition = _.partition
exports.uniqueId = _.uniqueId
exports.sortBy = _.sortBy
exports.groupBy = _.groupBy
exports.fromEntries = _.fromPairs
exports.times = _.times
exports.findLast = _.findLast
exports.memoize = _.memoize
exports.repeat = _.repeat
exports.shuffle = _.shuffle
exports.capitalize = _.upperFirst
exports.add = function(a, b) { return a + b }
exports.sum = function(array) { return array.reduce(exports.add, 0) }
exports.first = function(array) { return array[0] }
exports.second = function(array) { return array[1] }
exports.third = function(array) { return array[2] }
exports.last = function(array) { return array[array.length - 1] }
exports.reverse = function(array) { return array.slice().reverse() }
exports.isValidEmail = function(email) { return email.indexOf("@") >= 0 }
exports.sort = function(fn, array) { return array.slice().sort(fn) }
exports.subtract = function(a, b) { return a - b }
exports.const = function(value) { return function() { return value } }
exports.map1st = function(fn, arr) { return cons(fn(arr[0]), arr.slice(1)) }

exports.mapM = function(array, state, fn) {
	return [array.map((value) => (
		[value, state] = fn(state, value), value
	)).filter(Boolean), state]
}

exports.partitionMap = function(array, fn) {
	return array.reduce(function(partitions, value) {
		var mapped = fn(value)
		if (mapped != null) partitions[0].push(mapped)
		else partitions[1].push(value)
		return partitions
	}, [[], []])
}

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

exports.lastUniqBy = function(array, by) {
	return exports.values(array.reduce(function(values, value) {
		return values[by(value)] = value, values
	}, {}))
}

function cons(value, rest) { return concat([value], rest) }

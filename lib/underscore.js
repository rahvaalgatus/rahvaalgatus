var _ = require("lodash")
var O = require("oolong")
var Uuid = require("uuid")
var egal = require("egal")

// eslint-disable-next-line no-extend-native
Object.defineProperty(Object.prototype, "__proto__", {
  value: undefined, configurable: true, writable: true
})

exports.id = function(value) { return value }
exports.create = O.create
exports.clone = O.clone
exports.isEmpty = O.isEmpty
exports.defaults = O.defaults
exports.assign = O.assign
exports.object = O.object
exports.merge = O.merge
exports.mergeWith = _.mergeWith
exports.zip = _.zip
exports.unzip = _.unzip
exports.difference = _.difference
exports.chunk = _.chunk
exports.compose = _.flowRight
exports.reject = _.reject
exports.contains = _.includes
exports.any = _.some
exports.pick = _.pick
exports.min = _.min
exports.max = _.max
exports.once = _.once
exports.map = _.map
exports.property = O.property
exports.mapValues = O.map
exports.hasOwn = O.hasOwn
exports.filterValues = O.filter
exports.each = O.each
exports.values = O.values
exports.indexBy = _.keyBy
exports.keys = O.keys
exports.uniq = _.uniq
exports.omit = _.omit
exports.padLeft = _.padStart
exports.uniqBy = _.uniqBy
exports.without = _.without
exports.partition = _.partition
exports.uniqueId = _.uniqueId
exports.sortBy = _.sortBy
exports.groupBy = _.groupBy
exports.toEntries = _.toPairs
exports.fromEntries = _.fromPairs
exports.times = _.times
exports.find = _.find
exports.findLast = _.findLast
exports.memoize = _.memoize
exports.repeat = _.repeat
exports.shuffle = _.shuffle
exports.capitalize = _.upperFirst
exports.deepEquals = egal.deepEgal
exports.add = function(a, b) { return a + b }
exports.sum = function(array) { return array.reduce(exports.add, 0) }
exports.first = function(array) { return array[0] }
exports.second = function(array) { return array[1] }
exports.third = function(array) { return array[2] }
exports.last = function(array) { return array[array.length - 1] }
exports.reverse = function(array) { return array.slice().reverse() }
exports.isValidEmail = RegExp.prototype.test.bind(/^.+@.+$/)
exports.sort = function(fn, array) { return array.slice().sort(fn) }
exports.subtract = function(a, b) { return a - b }
exports.const = function(value) { return function() { return value } }
exports.map1st = function(fn, arr) { return cons(fn(arr[0]), arr.slice(1)) }
exports.concat = Array.prototype.concat.bind(Array.prototype)
exports.flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)

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

exports.groupAdjacent = function(array, fn) {
	if (array.length == 0) return []
	if (array.length == 1) return [array]

	var grouped = [[array[0]]]

	for (var i = 1; i < array.length; ++i) {
		if (fn(array[i - 1], array[i])) _.last(grouped).push(array[i])
		else grouped.push([array[i]])
	}

	return grouped
}

exports.escapeHtml = function(text) {
	text = text.replace(/&/g, "&amp;")
	text = text.replace(/</g, "&lt;")
	text = text.replace(/>/g, "&gt;")
	text = text.replace(/"/g, "&quot;") // For use in attributes.
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

exports.uuidV4 = function() {
	return Buffer.from(Uuid.v4("binary"))
}

exports.parseUuid = function(uuid) {
	return Buffer.from(uuid.replace(/-/g, ""), "hex")
}

exports.serializeUuid = require("uuid/lib/bytesToUuid")

exports.lastUniqBy = function(array, by) {
	return exports.values(array.reduce(function(values, value) {
		return values[by(value)] = value, values
	}, {}))
}

exports.caseInsensitiveEquals = function(a, b) {
	return a.toLowerCase() === b.toLowerCase()
}

exports.intersperse = function(array, elem) {
	if (array.length < 2) return array
	var output = new Array(array.length + array.length - 1)
	output.push(array[0])
	for (var i = 1; i < array.length; ++i) output.push(elem, array[i])
	return output
}

exports.asArray = function(value) {
	return value instanceof Array ? value : [value]
}

exports.getBirthdateFromPersonalId = function(personalId) {
	var numbers = /^([1-6])(\d\d)(\d\d)(\d\d)/.exec(personalId)
	if (numbers == null) return null

	var [_m, cent, year, month, day] = numbers

	return new Date(
		{1: 1800, 2: 1800, 3: 1900, 4: 1900, 5: 2000, 6: 2000}[cent] + Number(year),
		Number(month) - 1,
		Number(day)
	)
}

function cons(value, rest) { return _.concat([value], rest) }

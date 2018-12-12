var egal = require("egal")
var isEmpty = require("oolong").isEmpty
var isArray = Array.isArray
var isPlainObject = require("oolong").isPlainObject
exports = module.exports = diff

function diff(a, b) {
  /* eslint consistent-return: 0 */
  if (egal(a, b)) return undefined
  if (isArray(a) && isArray(b)) return diffArrayWith(diff, a, b)
  if (isPlainObject(a) && isPlainObject(b)) return diffObjectWith(diff, a, b)
	return b
}

function diffArrayWith(diff, a, b) {
	if (a.length !== b.length) return b
	for (var i = 0; i < a.length; ++i)
		if (diff(a[i], b[i]) !== undefined) return b
	return undefined
}

function diffObjectWith(diff, a, b) {
  var changes = {}, value
  for (var key in b) {
    if (!(key in a)) changes[key] = b[key]
    else if ((value = diff(a[key], b[key])) !== undefined) changes[key] = value
  }

  return isEmpty(changes) ? undefined : changes
}

var isCapture = RegExp.prototype.test.bind(/capture$/)
exports = module.exports = EventListener
exports.EMPTY = new EventListener(null)

function EventListener(listener) {
  this.listener = listener
}

EventListener.prototype.hook = function(el, attr, prev) {
  var fn = this.listener
  if (fn == null) return
  if (prev && fn === prev.listener) return

  attr = attr.toLowerCase()
  var capture = isCapture(attr)
  if (!capture && attr in el) el[attr] = fn
  else el.addEventListener((capture ? trimCap : trimBub)(attr), fn, capture)
}

EventListener.prototype.unhook = function(el, attr, next) {
  var fn = this.listener
  if (fn == null) return
  if (next && fn === next.listener) return

  attr = attr.toLowerCase()
  var capture = isCapture(attr)
  if (!capture && attr in el) el[attr] = null
  else el.removeEventListener((capture ? trimCap : trimBub)(attr), fn, capture)
}

function trimCap(name) { return name.slice(2, -7) }
function trimBub(name) { return name.slice(2) }

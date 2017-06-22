var _ = require("./underscore")
var Jsx = require("./jsx")
module.exports = View

function View(attrs) {
	if (attrs) _.assign(this, attrs)
}

View.prototype.el = null
View.prototype.vel = null
View.prototype.children = null
View.prototype.listenees = null

View.prototype.render = function() {
  this.setVirtualElement(this.template())
}

View.prototype.template = function() {}

View.prototype.setElement = function(el) {
  if (el === this.el) return
  var parent = this.el && this.el.parentNode
  if (parent) parent.replaceChild(el, this.el)
  this.el = el
}

View.prototype.setVirtualElement = function(vel) {
  var el = Jsx.render(vel, this.vel, this.el)
  if (this.vel !== vel) this.vel = vel
  if (this.el !== el) this.setElement(el)
}

View.prototype.set = function(attrs) {
	var changed = false

	for (var key in attrs) {
		if (this[key] === attrs[key]) continue
		changed = true
		this[key] = attrs[key]
	}

	if (changed) this.render()
}

exports = module.exports = jsx
var Vnode = require("virtual-dom/vnode/vnode")
var Vtext = require("virtual-dom/vnode/vtext")
var EventListener = require("./vdom/event_listener")
var Attribute = require("virtual-dom/virtual-hyperscript/hooks/attribute-hook")
var svgAttr = require("virtual-dom/virtual-hyperscript/svg-attribute-namespace")
var render = require("virtual-dom/create-element")
var diff = require("virtual-dom/diff")
var patch = require("virtual-dom/patch")
var isArray = Array.isArray
var isEvent = RegExp.prototype.test.bind(/^on[A-Z]/)
var SVG_TAGS = index(require("./vdom/svg_tags"))
var EMPTY_LISTENER = EventListener.EMPTY
var EMPTY_ARR = Array.prototype
var EMPTY_VNODE = new Vtext("")
var SVG_NAMESPACE = "http://www.w3.org/2000/svg"
exports.EMPTY_VNODE = EMPTY_VNODE

function jsx(tagName, props, children) {
  if (typeof tagName === "function") return tagName(props, children)
  else return createElement(tagName, props, children)
}

exports.render = function(vnode, oldVnode, el) {
  if (oldVnode && el) return patch(el, diff(oldVnode, vnode))
  else return render(vnode)
}

/**
 * createElement mutates its inputs for implementation ease and performance.
 * Not that I really benchmarked it. O:)
 */
function createElement(tagName, props, children) {
	var namespace = tagName in SVG_TAGS ? SVG_NAMESPACE : null
  children = children == null ? EMPTY_ARR : children.reduce(createChild, [])
  if (props == null) return new Vnode(tagName, props, children, null, namespace)

  var key = props.key
  if ("key" in props) props.key = undefined

  for (var prop in props) if (isEvent(prop)) props[prop] = listen(props[prop])
	if (namespace === SVG_NAMESPACE) svgPropsify(props)
  return new Vnode(tagName, props, children, key, namespace)
}

// Empty nested arrays are not expected to be replaced with a null node as we're
// not expecting them to always have the same length anyways.
function createChild(children, child) {
  if (isArray(child)) return child.reduce(createChild, children)
  else return children.push(createNode(child)), children
}

function createNode(value) {
  switch (value === null ? "null" : typeof value) {
    case "null": return EMPTY_VNODE
    case "number":
    case "string": return new Vtext(value)
    case "object": return value
    default: throw new TypeError("Invalid Virtual Node: " + value)
  }
}

function svgPropsify(props) {
	var attrs = props.attributes || (props.attributes = {}), ns

	for (var prop in props) {
		switch (ns = svgAttr(prop)) {
			case undefined: break
			case null: attrs[prop] = props[prop]; props[prop] = undefined; break
			default: props[prop] = new Attribute(ns, props[prop])
		}
	}
}

function listen(fn) {
  return fn == null ? EMPTY_LISTENER : new EventListener(fn)
}

function index(array) {
	return array.reduce(function(obj, val) { return obj[val] = true, obj }, {})
}

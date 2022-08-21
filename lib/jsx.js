var outdent = require("./outdent")
var jsonify = JSON.stringify
var SPACE = process.env.ENV == "development" ? "\t" : null

exports.javascript = function(_strings) {
	for (var i = 1, as = arguments; i < as.length; ++i) as[i] = stringify(as[i])
	var js = outdent.apply(this, arguments)
	return "(function() {\n" + js + "})()"
}

exports.confirm = function(text) {
	return "return confirm(" + stringify(text) + ")"
}

function stringify(obj, replacer, space) {
  if (obj === undefined) return "undefined"
  return escape(jsonify(obj, replacer, space === undefined ? SPACE : space))
}

function escape(json) {
  json = json.replace(/<\//g, "<\\/")
  json = json.replace(/\u2028/g, "\\u2028")
  json = json.replace(/\u2029/g, "\\u2029")
  return json
}

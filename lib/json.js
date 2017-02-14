var jsonify = JSON.stringify
var SPACE = process.env.ENV == "development" ? "\t" : null

exports.stringify = function(obj, replacer, space) {
  if (obj === undefined) return "undefined"
  return escape(jsonify(obj, replacer, space === undefined ? SPACE : space))
}

function escape(json) {
  json = json.replace(/<\//g, "<\\/")
  json = json.replace(/\u2028/g, "\\u2028")
  json = json.replace(/\u2029/g, "\\u2029")
  return json
}

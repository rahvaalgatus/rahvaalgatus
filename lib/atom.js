var Hugml = require("hugml")
var hugml = new Hugml({"http://www.w3.org/2005/Atom": ""})
exports.parse = hugml.parse.bind(hugml)
exports.$ = function(text) { return {$: text} }

var outdent = require("./outdent")

exports.javascript = function(_strings) {
	var js = outdent.apply(this, arguments)
	return "(function() {\n" + js + "})()"
}

exports.confirm = function(text) {
	return "return confirm(" + JSON.stringify(text) + ")"
}

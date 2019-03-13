var outdent = require("./outdent")

exports.javascript = function(_strings) {
	var js = outdent.apply(this, arguments)
	return "(function() {\n" + js + "})()"
}

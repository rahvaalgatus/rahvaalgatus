var Fs = require("fs")
var parseMarkdown = require("marked")

exports.readSync = function(path) {
	return parseMarkdown(Fs.readFileSync(path, "utf8"), {
		gfm: true,
		headerIds: false,
		breaks: true
	})
}

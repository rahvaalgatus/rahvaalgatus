var Fs = require("fs")
var {ENV} = process.env
var parseMarkdown = require("marked")

exports.readSync = function(path) {
	if (ENV == "development" && process.send)
		process.send({cmd: "NODE_DEV", required: path})

	return parseMarkdown(Fs.readFileSync(path, "utf8"), {
		gfm: true,
		headerIds: false,
		breaks: true
	})
}

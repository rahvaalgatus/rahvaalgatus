var Yauzl = require("yauzl")
var slurp = require("root/lib/stream").slurp
var denodeify = require("denodeify")

exports.parse = denodeify(Yauzl.fromBuffer)

exports.parseEntries = function(zip) {
	var entries = {}
	zip.on("entry", (entry) => (entries[entry.fileName] = entry))

	return new Promise(function(resolve, reject) {
		zip.on("error", reject)
		zip.on("end", resolve.bind(null, entries))
	})
}

exports.readEntry = function(zip, entry) {
	return new Promise(function(resolve, reject) {
		zip.openReadStream(entry, (err, stream) => (
			err ? reject(err) : resolve(slurp(stream, "utf8"))
		))
	})
}

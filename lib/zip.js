var Yazl = require("yazl").ZipFile
var Yauzl = require("yauzl")
var ReadableStream = require("stream").Readable
var slurp = require("root/lib/stream").slurp
var denodeify = require("denodeify")
exports = module.exports = Zip
exports.EMPTY_ZIP = "\x50\x4b\x05\x06\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0"

function Zip() {
	this.zip = new Yazl
}

Zip.prototype.type = "application/zip"

Zip.prototype.add = function(path, data) {
	if (typeof data == "string") data = Buffer.from(data)
	if (data instanceof Buffer) this.zip.addBuffer(data, path)
	else if (data instanceof ReadableStream) this.zip.addReadStream(data, path)
	else throw new TypeError("Unsupported Zip data: " + data)
}

Zip.prototype.toStream = function() { return this.zip.outputStream }

Zip.prototype.pipe = function(to, opts) {
	return this.toStream().pipe(to, opts)
}

Zip.prototype.unpipe = function(to) { return this.toStream.unpipe(to) }

Zip.prototype.end = function() {
	this.zip.end()
	this.ended = true
}

Zip.prototype.toBuffer = function() {
	this.end()
	return slurp(this.toStream())
}

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
	if (entry == null) throw new TypeError("Null entry: " + entry)

	return new Promise(function(resolve, reject) {
		zip.openReadStream(entry, (err, stream) => (
			err ? reject(err) : resolve(slurp(stream))
		))
	})
}

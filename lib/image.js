var Sharp = require("sharp")

var SIGNATURES = [
	[parseBytes("FFD8FF"), "image/jpeg"],
	[parseBytes("89504E470D0A1A0A"), "image/png"]
]

// Beware of passing _any_ type of image to Sharp. Some of its decoders could
// be buggy. Better whitelist known-safe types..
exports.resize = function(width, height, buffer) {
	// If no explicit format is set, the output format will match the input
	// image, except GIF and SVG input which become PNG output.
	// http://sharp.pixelplumbing.com/en/stable/api-output/
	return Sharp(buffer).resize({
		width: width,
		height: height,
		fit: "inside",
		withoutEnlargement: true
	}).toBuffer()
}

exports.identify = function(buffer) {
	return (SIGNATURES.find(([bytes, _type]) => (
		buffer.slice(0, bytes.length).equals(bytes)
	)) || [null, null])[1]
}

function parseBytes(bytes) { return Buffer.from(bytes, "hex") }

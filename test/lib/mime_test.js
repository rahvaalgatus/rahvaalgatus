var _ = require("root/lib/underscore")
var Mime = require("root/lib/mime")

describe("Mime", function() {
	_.each({
		// A couple of regular MIME types, too, to ensure we've populated the
		// defaults.
		"text/html": ["html", "htm"],
		"image/png": ["png"],
		"application/vnd.etsi.asic-e+zip": ["asice", "bdoc"]
	}, function(extensions, type) {
		extensions.forEach(function(extension) {
			it(`must return ${type} for .${extensions}`, function() {
				Mime.types[extension].must.equal(type)
			})
		})

		it(`must return .${extensions[0]} for ${type}`, function() {
			Mime.extension(type).must.equal(extensions[0])
		})
	})
})

var _ = require("lodash")
var Mocha = require("mocha")
var slice = Function.call.bind(Array.prototype.slice)
var CACHE = require.cache

process.on("unhandledRejection", function() {})

// Must.js doesn't support comparing buffers' contents out of the box, so let's
// fix Buffer to help with that.
Buffer.prototype.valueOf = Buffer.prototype.toJSON

Mocha.prototype.loadFiles = _.wrap(Mocha.prototype.loadFiles, function(orig) {
	orig.apply(this, slice(arguments, 1))

	// Mocha will not clear files in the bin directory.
	after(function() { delete CACHE[require.resolve("root/bin/adm")] })
	after(function() { delete CACHE[require.resolve("root/bin/web")] })

	after(function() {
		for (var path in CACHE) if (path.endsWith(".jsx")) delete CACHE[path]
	})
})

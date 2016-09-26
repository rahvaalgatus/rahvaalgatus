var _ = require("lodash")
var Mocha = require("mocha")

Mocha.prototype.loadFiles = _.wrap(Mocha.prototype.loadFiles, function(orig) {
	orig.apply(this, Array.prototype.slice.call(arguments, 1))

	// Mocha will not clear files in the bin directory.
	after(function() { delete require.cache[require.resolve("root/bin/web")] })
})

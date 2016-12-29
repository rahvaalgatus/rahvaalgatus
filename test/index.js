var _ = require("lodash")
var Mocha = require("mocha")
var slice = Function.call.bind(Array.prototype.slice)

Mocha.prototype.loadFiles = _.wrap(Mocha.prototype.loadFiles, function(orig) {
	orig.apply(this, slice(arguments, 1))

	// Mocha will not clear files in the bin directory.
	after(function() { delete require.cache[require.resolve("root/bin/web")] })
})

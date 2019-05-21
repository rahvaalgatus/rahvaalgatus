var Sinon = require("sinon")

module.exports = function(at) {
	if (at instanceof Date) at = +at
	else if (at == null) at = Date.now()

	beforeEach(function() { this.time = Sinon.useFakeTimers(at, "Date") })
	afterEach(function() { this.time.restore() })
}

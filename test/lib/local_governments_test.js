var _ = require("root/lib/underscore")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")

describe("LOCAL_GOVERNMENTS", function() {
	it("must have a non-zero population on all governments", function() {
		_.each(LOCAL_GOVERNMENTS, function(gov) {
			gov.population.must.be.at.least(1)
			gov.population.must.be.at.most(1000000)
		})
	})

	// https://www.riigiteataja.ee/akt/13312632?leiaKehtiv#para32
	it("must have a signature threshold on all governments", function() {
		_.each(LOCAL_GOVERNMENTS, function(gov) {
			var threshold = Math.max(Math.round(gov.population * 0.01), 5)
			gov.signatureThreshold.must.equal(threshold)
		})
	})
})

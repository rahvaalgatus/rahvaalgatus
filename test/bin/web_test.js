var O = require("oolong")

describe("Web", function() {
	require("root/test/web")()

	O.each({
		"/votings": "/",
		"/topics": "/",
		"/topics/": "/",
		"/topics/42": "/initiatives/42",
		"/topics/42/discussion": "/initiatives/42/discussion",
		"/topics/42/vote": "/initiatives/42/vote",
		"/topics/42/events": "/initiatives/42/events",
		"/topics/42/votes/69": "/initiatives/42/vote",
		"/topics/create1": "/initiatives/new",
		"/discussions": "/",
		"/goodpractice": "/about",
		"/support_us": "/donate",
	}, function(to, from) {
		describe(from, function() {
			before(function*() {
				this.res = yield this.request(from, {method: "HEAD"})
			})

			it("must redirect to " + to, function() {
				;[301, 302].must.include(this.res.statusCode)
				this.res.headers.location.must.equal(to)
			})
		})
	})

	;[
		"/webfonts/3084E9_3_0.eot",
		"/webfonts/3084E9_3_0.woff2",
		"/webfonts/3084E9_3_0.woff",
		"/webfonts/3084E9_3_0.ttf",
		"/fonts/tisapro-regular-webfont.svg",
		"/assets/etherpad.css"
	].forEach(function(path) {
		describe(path, function() {
			before(function*() {
				this.res = yield this.request(path, {method: "HEAD"})
			})

			it("must have CORS headers", function() {
				this.res.headers["access-control-allow-origin"].must.equal("*")
			})
		})
	})
})

var O = require("oolong")
var request = require("fetch-off/request")
var fetchDefaults = require("fetch-defaults")
var URL = process.env.URL || "https://rahvaalgatus.ee"
var CANONICAL_URL = "https://rahvaalgatus.ee"

if (process.env.TEST.match(/\bserver\b/))
describe(URL, function() {
	before(function() { this.request = fetchDefaults(request, URL) })

	describe("/", function() {
		var PATH = this.title

		before(function*() {
			this.res = yield this.request(PATH, {method: "HEAD"})
		})

		it("must respond with 200 OK", function() {
			this.res.statusCode.must.equal(200)
		})
	})
	
	describe("/stylesheets/page.css", function() {
		var PATH = this.title

		before(function*() {
			this.res = yield this.request(PATH, {
				method: "HEAD",
				headers: {"Accept-Encoding": "gzip"}
			})
		})

		it("must have a Cache-Control header", function() {
			var control = this.res.headers["cache-control"]
			control.must.equal("max-age=0, public, must-revalidate")
		})

		it("must not have an Expires header", function() {
			this.res.headers.must.not.have.property("expires")
		})

		it("must have an ETag header", function() {
			this.res.headers.must.have.property("etag")
		})

		// Apache has an issue that if the content is encoded with gzip, the
		// returned ETag has a "-gzip suffix and that breaks futher comparison.
		it("must respond with 304 Not Modified if given ETag", function*() {
			this.res.headers["content-encoding"].must.equal("gzip")

			var etag = this.res.headers.etag
			var res = yield this.request(PATH, {
				method: "HEAD",
				headers: {"Accept-Encoding": "gzip", "If-None-Match": etag}
			})

			res.statusCode.must.equal(304)
		})
	})

	O.each({
		"/votings": "/topics",
		"/topics/42/votes/69": "/topics/42/vote",
		"/topics/create1": "/topics/new",
	}, function(to, from) {
		describe(from, function() {
			before(function*() {
				this.res = yield this.request(from, {method: "HEAD"})
			})

			it("must redirect to " + to, function() {
				this.res.statusCode.must.equal(301)
				this.res.headers.location.must.equal(URL + to)
			})
		})
	})

	;[
		"/topics/42",
	].forEach(function(path) {
		describe(path, function() {
			before(function*() {
				this.res = yield this.request(path, {method: "HEAD"})
			})

			it("must not redirect", function() {
				this.res.statusCode.must.equal(200)
			})
		})
	})
})

describe("http://rahvaalgatus.ee", function() {
	mustRedirectToCanonical(this.title)
})

describe("http://www.rahvaalgatus.ee", function() {
	mustRedirectToCanonical(this.title)
})

function mustRedirectToCanonical(url) {
	describe("as not a canonical URL", function() {
		before(function() { this.request = fetchDefaults(request, url) })

		describe("/", function() {
			var PATH = this.title

			before(function*() {
				this.res = yield this.request(PATH, {method: "HEAD"})
			})

			it("must redirect to " + CANONICAL_URL, function() {
				this.res.headers.location.must.equal(CANONICAL_URL + "/")
			})

			it("must redirect with 301 Moved Permanently", function() {
				this.res.statusCode.must.equal(301)
			})
		})

		describe("/foo/bar?42", function() {
			var PATH = this.title

			before(function*() {
				this.res = yield this.request(PATH, {method: "HEAD"})
			})

			it("must redirect to same path over HTTPS", function() {
				this.res.headers.location.must.equal(CANONICAL_URL + "/foo/bar?42")
			})

			it("must redirect with 301 Moved Permanently", function() {
				this.res.statusCode.must.equal(301)
			})
		})
	})
}

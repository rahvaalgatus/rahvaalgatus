var request = require("fetch-off/request")
var fetchDefaults = require("fetch-defaults")
var URL = process.env.URL || "https://rahvaalgatus.ee"
var CANONICAL_URL = "https://rahvaalgatus.ee"

if (/\bserver\b/.test(process.env.TEST_TAGS))
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
	
	;[
		"/assets/page.css"
	].forEach(function(path) {
		xdescribe(path, function() {
			var PATH = this.title

			before(function*() {
				this.res = yield this.request(PATH, {
					method: "HEAD",
					headers: {"Accept-Encoding": "gzip"}
				})

				this.res.statusCode.must.equal(200)
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

			it("must not have a Last-Modified header", function() {
				this.res.headers.must.not.have.property("last-modified")
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
	})
})

if (/\bserver\b/.test(process.env.TEST_TAGS))
xdescribe("http://rahvaalgatus.ee", function() {
	mustRedirectToCanonical(this.title)
})

if (/\bserver\b/.test(process.env.TEST_TAGS))
xdescribe("http://www.rahvaalgatus.ee", function() {
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

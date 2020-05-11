var request = require("fetch-off/request")
var fetchDefaults = require("fetch-defaults")
var concat = Array.prototype.concat.bind(Array.prototype)
var URL = "https://rahvaalgatus.ee"
var HEADERS = {headers: {"User-Agent": "Rahvaalgatus Tests"}}

if (/\bserver\b/.test(process.env.TEST_TAGS))
describe(URL, function() {
	this.timeout(5000)
	var req = fetchDefaults(request, URL, HEADERS)

	describe("/", function() {
		before(function*() { this.res = yield req("/", {method: "HEAD"}) })

		it("must respond with 200 OK", function() {
			this.res.statusCode.must.equal(200)
		})
	})

	var CORS_PATHS = [
		// Fonts are also used from Voog.
		"/assets/voog.css",
		"/assets/tisapro-regular-webfont.svg"
	]
	
	concat(
		"/assets/page.css",
		CORS_PATHS
	).forEach(function(path) {
		describe(path, function() {
			before(function*() {
				this.res = yield req(path, {
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

			// Zone's Apache has an issue that if the content is encoded with gzip,
			// the returned ETag has a "-gzip suffix and that breaks futher
			// comparison.
			it("must respond with 304 Not Modified if given ETag", function*() {
				this.res.headers["content-encoding"].must.equal("gzip")

				var etag = this.res.headers.etag
				var res = yield req(path, {
					method: "HEAD",
					headers: {"Accept-Encoding": "gzip", "If-None-Match": etag}
				})

				res.statusCode.must.equal(304)
			})
		})
	})

	CORS_PATHS.forEach(function(path) {
		describe(path, function() {
			before(function*() {
				this.res = yield req(path, {method: "HEAD"})
				this.res.statusCode.must.equal(200)
			})

			it("must have CORS headers", function() {
				this.res.headers["access-control-allow-origin"].must.equal("*")
			})
		})
	})
})

if (/\bserver\b/.test(process.env.TEST_TAGS)) [
	"http://rahvaalgatus.ee",
	"http://www.rahvaalgatus.ee",
	"https://www.rahvaalgatus.ee"
].forEach(function(url) {
	describe(url, function() {
		mustRedirectTo(url, URL)
	})
})

function mustRedirectTo(from, to) {
  var req = fetchDefaults(request, from, HEADERS)

	describe("as a canonical URL", function() {
		describe("/", function() {
			before(function*() { this.res = yield req("/", {method: "HEAD"}) })

			it("must redirect to " + to, function() {
				this.res.statusCode.must.equal(301)
				this.res.headers.location.must.equal(to + "/")
			})
		})

		describe("/foo/bar?42", function() {
			before(function*() {
				this.res = yield req("/foo/bar?42", {method: "HEAD"})
			})

			it("must redirect to same path on " + to, function() {
				this.res.statusCode.must.equal(301)
				this.res.headers.location.must.equal(to + "/foo/bar?42")
			})
		})
	})
}

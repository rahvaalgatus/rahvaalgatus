var _ = require("root/lib/underscore")
var request = require("fetch-off/request")
var fetchDefaults = require("fetch-defaults")
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

		it("must have a Cache-Control header", function() {
			var control = this.res.headers["cache-control"]
			control.must.equal("no-cache")
		})

		it("must have an ETag header", function() {
			this.res.headers.must.have.property("etag")
		})

		it("must not have a Last-Modified header", function() {
			this.res.headers.must.not.have.property("last-modified")
		})

		it("must not have an Expires header", function() {
			this.res.headers.must.not.have.property("expires")
		})
	})

	;[
		"/assets/page.css",
		"/assets/tisapro-regular-webfont.svg"
	].forEach(function(path) {
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

			it("must have an ETag header", function() {
				this.res.headers.must.have.property("etag")
			})

			it("must not have a Last-Modified header", function() {
				this.res.headers.must.not.have.property("last-modified")
			})

			it("must not have an Expires header", function() {
				this.res.headers.must.not.have.property("expires")
			})

			it("must respond with 304 Not Modified if given ETag", function*() {
				this.res.headers["content-encoding"].must.equal("gzip")

				var res = yield req(path, {
					method: "HEAD",
					headers: {"If-None-Match": this.res.headers.etag}
				})

				res.statusCode.must.equal(304)
			})

			it("must respond with 304 Not Modified if given ETag and gzip",
				function*() {
				this.res.headers["content-encoding"].must.equal("gzip")

				var res = yield req(path, {
					method: "HEAD",
					headers: {
						"Accept-Encoding": "gzip",
						"If-None-Match": this.res.headers.etag
					}
				})

				res.statusCode.must.equal(304)
			})

			// Assets are used by subsites like riigikogu.rahvaalgatus.ee.
			it("must have CORS headers", function() {
				this.res.headers["access-control-allow-origin"].must.equal("*")
			})
		})
	})
})

if (/\bserver\b/.test(process.env.TEST_TAGS)) _.each({
	"http://rahvaalgatus.ee": "/",
	"http://www.rahvaalgatus.ee": "/",
	"https://www.rahvaalgatus.ee": "/",
	"https://riigikogu.rahvaalgatus.ee": "/parliament",
	"https://kohalik.rahvaalgatus.ee": "/local"
}, (rootPath, url) => describe(url, function() {
	mustRedirectTo(url, URL, rootPath)
}))

function mustRedirectTo(from, to, rootPath) {
  var req = fetchDefaults(request, from, HEADERS)

	describe("as a canonical URL", function() {
		describe("/", function() {
			before(function*() { this.res = yield req("/", {method: "HEAD"}) })

			it("must redirect to " + to + rootPath, function() {
				this.res.statusCode.must.equal(301)
				this.res.headers.location.must.equal(to + rootPath)
			})
		})

		describe("/?42", function() {
			before(function*() { this.res = yield req("/?42", {method: "HEAD"}) })

			it("must redirect to " + to + rootPath, function() {
				this.res.statusCode.must.equal(301)
				this.res.headers.location.must.equal(to + rootPath + "?42")
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

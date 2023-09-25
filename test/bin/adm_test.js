var _ = require("root/lib/underscore")
var Config = require("root").config
var parseHtml = require("root/test/html").parse
var some = Function.call.bind(Array.prototype.some)

describe("Adm", function() {
	require("root/test/adm")()
	require("root/test/db")()

	describe("/", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var res = yield this.request(`/`)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Not an Admin")
			})
		})

		describe("when logged in as user", function() {
			require("root/test/fixtures").user()

			it("must respond with 403", function*() {
				var res = yield this.request(`/`)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not an Admin")
			})
		})

		describe("when logged in as admin", function() {
			require("root/test/db")()
			require("root/test/fixtures").admin()

			it("must respond with cache headers", function*() {
				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				res.headers["cache-control"].must.equal("no-store")
				res.headers.must.have.property("etag")
				res.headers.must.not.have.property("last-modified")
				res.headers.must.not.have.property("expires")
			})

			it("must not render signatures tab if without permission", function*() {
				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				some(dom.querySelectorAll("#header nav li"), (el) => (
					el.textContent == "Signatures"
				)).must.be.false()
			})

			it("must render signatures tab if with permission", function*() {
				_.each(Config.admins, (perms) => perms.push("signatures"))
				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				some(dom.querySelectorAll("#header nav li"), (el) => (
					el.textContent == "Signatures"
				)).must.be.true()
			})
		})
	})

	describe("/non-existent", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var res = yield this.request("/non-exitent")
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Not an Admin")
			})
		})

		describe("when logged in", function() {
			require("root/test/db")()
			require("root/test/fixtures").admin()

			it("must respond with 404", function*() {
				var res = yield this.request("/non-exitent")
				res.statusCode.must.equal(404)

				res.headers["cache-control"].must.equal("no-store")
				res.headers.must.not.have.property("etag")
				res.headers.must.not.have.property("last-modified")
				res.headers.must.not.have.property("expires")
			})
		})
	})
})

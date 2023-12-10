var _ = require("root/lib/underscore")
var ExternalApi = require("root/lib/external_api")
var ValidExternalResponse = require("root/test/valid_external_response")
var MediaType = require("medium-type")
var FetchError = require("fetch-error")
var fetch = require("root/lib/fetch")
var responsesDb = require("root/db/external_responses_db")
var sql = require("sqlate")
var URL = "http://example.com"

var api = require("fetch-defaults")(fetch, URL, {
	headers: {Accept: "application/json"}
	})

api = require("fetch-parse")(api, {json: true, "*/*": true})
api = require("fetch-throw")(api)

describe("ExternalApi", function() {
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/time")()

	it("must request given path and cache it", function*() {
		var now = new Date
		var externalApi = new ExternalApi(URL, api, responsesDb)
		var res = externalApi.read("/models/42?include=children")

		var req = yield _.wait(this.mitm, "request")
		req.method.must.equal("GET")
		req.headers.host.must.equal("example.com")
		req.headers.accept.must.equal("application/json")
		req.url.must.equal("/models/42?include=children")

		req.res.setHeader("Content-Type", "application/json")
		req.res.setHeader("ETag", "\"deadbabebeef\"")
		req.res.end(JSON.stringify({id: 42, name: "John"}))

		this.time.tick(420)
		res = yield res
		res.status.must.equal(200)
		res.body.must.eql({id: 42, name: "John"})

		responsesDb.search(sql`SELECT * FROM external_responses`).must.eql([
			new ValidExternalResponse({
				id: 1,
				origin: "http://example.com",
				path: "/models/42?include=children",
				requested_at: now,
				updated_at: now,
				headers: {connection: "close"},
				etag: "\"deadbabebeef\"",
				body_type: new MediaType("application/json"),
				body: JSON.stringify({id: 42, name: "John"}),
				duration: 0.42
			})
		])
	})

	it("must request second request with if-none-match", function*() {
		var externalApi = new ExternalApi(URL, api, responsesDb)
		var res = externalApi.read("/models/42?include=children")

		var req = yield _.wait(this.mitm, "request")
		req.res.setHeader("Content-Type", "application/json")
		req.res.setHeader("ETag", "\"deadbabebeef\"")
		req.res.end(JSON.stringify({id: 42, name: "John"}))

		res = yield res
		res.status.must.equal(200)

		var cachedResponse = responsesDb.read(sql`SELECT * FROM external_responses`)

		res = externalApi.read("/models/42?include=children")

		req = yield _.wait(this.mitm, "request")
		req.method.must.equal("GET")
		req.headers.host.must.equal("example.com")
		req.headers.accept.must.equal("application/json")
		req.headers["if-none-match"].must.equal("\"deadbabebeef\"")
		req.url.must.equal("/models/42?include=children")

		req.res.statusCode = 304
		req.res.end()

		res = yield res
		res.status.must.equal(304)
		res.body.must.eql({id: 42, name: "John"})

		responsesDb.search(sql`
			SELECT * FROM external_responses
		`).must.eql([_.assign(cachedResponse, {
			requested_count: 2,
			updated_count: 1
		})])
	})

	it("must throw given error", function*() {
		var externalApi = new ExternalApi(URL, api, responsesDb)
		var res = externalApi.read("/models/42?include=children")

		var req = yield _.wait(this.mitm, "request")
		req.res.statusCode = 500
		req.res.end()

		var err
		try { yield res } catch (ex) { err = ex }
		err.must.be.an.error(FetchError)

		responsesDb.search(sql`SELECT * FROM external_responses`).must.eql([])
	})
})

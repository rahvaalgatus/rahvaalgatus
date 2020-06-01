var _ = require("root/lib/underscore")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_db_initiative")
var MediaType = require("medium-type")
var textsDb = require("root/db/initiative_texts_db")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")
var parseCookies = require("root/lib/http").parseCookies
var TRIX_TYPE = new MediaType("application/vnd.basecamp.trix+json")

describe("InitiativeTextsController", function() {
	require("root/test/web")()
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/fixtures").csrf()

	describe("POST /", function() {
		describe("when not logged in", function() {
			it("must respond with 401 if not published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {_csrf_token: this.csrfToken, content: "[]"}
				})

				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it("must respond with 401 if published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {_csrf_token: this.csrfToken, content: "[]"}
				})

				res.statusCode.must.equal(401)
			res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not the author", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {_csrf_token: this.csrfToken, content: "[]"}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})

			it("must respond with 405 if no longer in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {_csrf_token: this.csrfToken, content: "[]"}
				})

				res.statusCode.must.equal(405)
				res.statusMessage.must.must.equal("Can Only Edit Discussions")
			})

			it("must create new text and set title", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var content = newTrixDocument("Hello, world")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						title: "Let it shine",
						content: JSON.stringify(content)
					}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

				yield initiativesDb.read(initiative).must.then.eql({
					__proto__: initiative,
					title: "Let it shine"
				})

				yield textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.then.eql([{
					id: 1,
					basis_id: null,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					content: content,
					content_type: TRIX_TYPE
				}])

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_TEXT_CREATED"))
			})

			it("must create new text given basis", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var basis = yield textsDb.create({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					content: "<p>Hello, world!</p>",
					content_type: "text/html"
				})

				var content = newTrixDocument("How are you?")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						"basis-id": basis.id,
						content: JSON.stringify(content)
					}
				})

				res.statusCode.must.equal(302)

				yield textsDb.read(sql`
					SELECT * FROM initiative_texts WHERE id = 2
				`).must.then.eql({
					id: 2,
					basis_id: basis.id,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					content: content,
					content_type: TRIX_TYPE
				})
			})

			it("must ignore basis if from another initiative", function*() {
				var other = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var basis = yield textsDb.create({
					initiative_uuid: other.uuid,
					user_id: this.user.id,
					content: "<p>Hello, world!</p>",
					content_type: "text/html"
				})

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						"basis-id": basis.id,
						content: "[]"
					}
				})

				res.statusCode.must.equal(302)

				yield textsDb.read(sql`
					SELECT * FROM initiative_texts WHERE id = 2
				`).must.then.eql({
					id: 2,
					basis_id: null,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					content: [],
					content_type: TRIX_TYPE
				})
			})

			// <form>s may send valueless <input>s as empty strings.
			it("must ignore basis if empty string", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						"basis-id": "",
						content: "[]"
					}
				})

				res.statusCode.must.equal(302)
			})

			it("must create new text if initiative published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: new Date
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {_csrf_token: this.csrfToken, content: "[]"}
				})

				res.statusCode.must.equal(302)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_TEXT_CREATED_IF_PUBLISHED"))
			})
		})
	})
})

var BLOCK_BREAK = {
	"type": "string",
	"attributes": {"blockBreak": true},
	"string": "\n"
}

function newTrixDocument(text) {
	return [{
		"text": [{"type": "string", "attributes": {}, "string": text}, BLOCK_BREAK],
		"attributes": []
	}]
}


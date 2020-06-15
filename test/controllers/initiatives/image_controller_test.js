var _ = require("root/lib/underscore")
var Fs = require("fs")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidUser = require("root/test/valid_user")
var FormData = require("form-data")
var Http = require("root/lib/http")
var MediaType = require("medium-type")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var imagesDb = require("root/db/initiative_images_db")
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")

var PNG = Fs.readFileSync(
	require.resolve("root/public/assets/rahvaalgatus.png")
)

describe("ImageController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/fixtures").csrf()
	
	describe("PUT /", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var author = yield usersDb.create(new ValidUser)

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: author.id,
					published_at: new Date
				}))

				var path = `/initiatives/${initiative.uuid}/image`
				var res = yield this.request(path, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "PUT"}
				})

				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})
		
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not author", function*() {
				var author = yield usersDb.create(new ValidUser)

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: author.id,
					published_at: new Date
				}))

				var path = `/initiatives/${initiative.uuid}/image`
				var res = yield this.request(path, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "PUT"}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})

			it("must respond with 422 if image missing", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var path = `/initiatives/${initiative.uuid}/image`
				var res = yield this.request(path, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "PUT"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Image Missing")
			})

			it("must create new initiative image", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var form = new FormData
				form.append("_csrf_token", this.csrfToken)
				form.append("_method", "PUT")

				form.append("image", PNG, {
					filename: "image.png",
					contentType: "image/png"
				})

				var path = `/initiatives/${initiative.uuid}/image`
				var res = yield this.request(path, {
					method: "POST",
					headers: form.getHeaders(),
					body: form.getBuffer()
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

				var images = yield imagesDb.search(sql`SELECT * FROM initiative_images`)
				images.length.must.equal(1)
				images[0].initiative_uuid.must.equal(initiative.uuid)
				images[0].type.must.eql(new MediaType("image/png"))
				images[0].data.must.eql(PNG)
				images[0].preview.must.be.an.instanceOf(Buffer)
				images[0].preview.length.must.be.gt(0)

				var cookies = Http.parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_IMAGE_UPLOADED"))
			})
		})
	})
})

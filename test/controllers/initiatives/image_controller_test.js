var _ = require("root/lib/underscore")
var Fs = require("fs")
var ValidInitiative = require("root/test/valid_initiative")
var ValidUser = require("root/test/valid_user")
var ValidCoauthor = require("root/test/valid_initiative_coauthor")
var FormData = require("form-data")
var MediaType = require("medium-type")
var {parseCookies} = require("root/test/web")
var usersDb = require("root/db/users_db")
var coauthorsDb = require("root/db/initiative_coauthors_db")
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
				var author = usersDb.create(new ValidUser)

				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: author.id,
					published_at: new Date
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}/image`, {
					method: "PUT"
				})

				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not author", function*() {
				var author = usersDb.create(new ValidUser)

				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: author.id,
					published_at: new Date
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}/image`, {
					method: "PUT"
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})

			it("must respond with 422 if image missing", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}/image`, {
					method: "PUT"
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Image Missing")
			})

			it("must create new initiative image", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var form = new FormData

				form.append("image", PNG, {
					filename: "image.png",
					contentType: "image/png"
				})

				var res = yield this.request(`/initiatives/${initiative.uuid}/image`, {
					method: "PUT",
					headers: form.getHeaders(),
					body: form.getBuffer()
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Image Replaced")
				res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

				var images = imagesDb.search(sql`SELECT * FROM initiative_images`)
				images.length.must.equal(1)
				images[0].initiative_uuid.must.equal(initiative.uuid)
				images[0].uploaded_by_id.must.equal(this.user.id)
				images[0].type.must.eql(new MediaType("image/png"))
				images[0].data.must.eql(PNG)
				images[0].preview.must.be.an.instanceOf(Buffer)
				images[0].preview.length.must.be.gt(0)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_IMAGE_UPLOADED"))
			})

			it("must create new initiative image if coauthor", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var form = new FormData

				form.append("image", PNG, {
					filename: "image.png",
					contentType: "image/png"
				})

				var res = yield this.request(`/initiatives/${initiative.uuid}/image`, {
					method: "PUT",
					headers: form.getHeaders(),
					body: form.getBuffer()
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Image Replaced")
				res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

				var images = imagesDb.search(sql`SELECT * FROM initiative_images`)
				images.length.must.equal(1)
				images[0].initiative_uuid.must.equal(initiative.uuid)
				images[0].uploaded_by_id.must.equal(this.user.id)
			})

			it("must update author", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var otherUser = usersDb.create(new ValidUser)

				var image = imagesDb.create({
					initiative_uuid: initiative.uuid,
					uploaded_by_id: otherUser.id,
					data: PNG,
					preview: PNG,
					type: "image/png"
				})

				var res = yield this.request(`/initiatives/${initiative.uuid}/image`, {
					method: "PUT",
					form: {
						author_name: "John Smith",
						author_url: "http://example.com"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Image Author Updated")
				res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

				imagesDb.read(image).must.eql({
					__proto__: image,
					author_name: "John Smith",
					author_url: "http://example.com"
				})

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_IMAGE_AUTHOR_UPDATED"))
			})

			_.each({
				"too long author_name": {author_name: _.repeat("a", 101)},
				"too long author_url": {author_url: _.repeat("a", 1025)}
			}, function(attrs, title) {
				it(`must respond with 422 given ${title}`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var image = imagesDb.create({
						initiative_uuid: initiative.uuid,
						uploaded_by_id: this.user.id,
						data: PNG,
						preview: PNG,
						type: "image/png"
					})

					var res = yield this.request(
						`/initiatives/${initiative.uuid}/image`,
						{method: "PUT", form: attrs}
					)

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Invalid Attributes")
					imagesDb.read(image).must.eql(image)
				})
			})
		})
	})
})

var _ = require("root/lib/underscore")
var Config = require("root").config
var ValidUser = require("root/test/valid_user")
var ValidCoauthor = require("root/test/valid_initiative_coauthor")
var ValidInitiative = require("root/test/valid_initiative")
var ValidText = require("root/test/valid_initiative_text")
var MediaType = require("medium-type")
var textsDb = require("root/db/initiative_texts_db")
var usersDb = require("root/db/users_db")
var coauthorsDb = require("root/db/initiative_coauthors_db")
var initiativesDb = require("root/db/initiatives_db")
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")
var {parseCookies} = require("root/test/web")
var TRIX_TYPE = new MediaType("application/vnd.basecamp.trix+json")
var {newTrixDocument} = require("root/test/fixtures")
var outdent = require("root/lib/outdent")
var parseHtml = require("root/test/html").parse
var TITLE_MAX_LENGTH = 200
var SLUG_MAX_LENGTH = 150
var TRIX_SECTIONS_TYPE =
	new MediaType("application/vnd.rahvaalgatus.trix-sections+json")
var {SUMMARY_MAX_LENGTH} =
	require("root/controllers/initiatives/texts_controller")

describe("InitiativeTextsController", function() {
	require("root/test/web")()
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/fixtures").csrf()

	describe("POST /", function() {
		describe("when not logged in", function() {
			it("must respond with 401 if not published", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]"}
				})

				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it("must respond with 401 if published", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					published_at: new Date
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]"}
				})

				res.statusCode.must.equal(401)
			res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not the author", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					published_at: new Date
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]"}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})

			it("must respond with 403 if no longer in edit or sign phase",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "parliament"
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]"}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.must.equal("Not Editable")
			})

			it("must respond with 405 if in sign phase given initiative's language",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					language: "en"
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {title: "Hello", content: "[]", language: "en"}
				})

				res.statusCode.must.equal(405)
				res.statusMessage.must.must.equal("Can Only Add Translations")
			})

			it("must create text and set title", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					language: "en",
				}))

				var content = newTrixDocument("Let it shine.")
				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Hello, world!",
						content: JSON.stringify(content),
						language: "en"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")

				res.headers.location.must.equal(
					`/initiatives/${initiative.id}-hello-world`
				)

				initiativesDb.read(initiative).must.eql({
					__proto__: initiative,
					title: "Hello, world!",
					slug: "hello-world"
				})

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Hello, world!",
					language: "en",
					content: content,
					content_type: TRIX_TYPE
				})])

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_TEXT_CREATED"))
			})

			it("must create text and set title given text sections", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					language: "en",
				}))

				var summary = newTrixDocument("World.")
				var problem = newTrixDocument("Bad world.")
				var solution = newTrixDocument("Make better.")

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Hello, world!",
						"content[summary]": JSON.stringify(summary),
						"content[problem]": JSON.stringify(problem),
						"content[solution]": JSON.stringify(solution),
						language: "en"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")

				res.headers.location.must.equal(
					`/initiatives/${initiative.id}-hello-world`
				)

				initiativesDb.read(initiative).must.eql({
					__proto__: initiative,
					title: "Hello, world!",
					slug: "hello-world"
				})

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Hello, world!",
					language: "en",
					content: {summary, problem, solution},
					content_type: TRIX_SECTIONS_TYPE
				})])

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_TEXT_CREATED"))
			})

			it(`must err given summary longer than ${SUMMARY_MAX_LENGTH} characters and text sections`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var summary = newTrixDocument(_.repeat("a", SUMMARY_MAX_LENGTH + 1))
				var problem = newTrixDocument("")
				var solution = newTrixDocument("")

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Hello, world!",
						"content[summary]": JSON.stringify(summary),
						"content[problem]": JSON.stringify(problem),
						"content[solution]": JSON.stringify(solution),
						language: initiative.language
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Attributes")
				initiativesDb.read(initiative).must.eql(initiative)

				var dom = parseHtml(res.body)
				var form = dom.getElementById("initiative-form")
				form.elements.title.value.must.equal("Hello, world!")

				form.elements["content[summary]"].value.must.equal(
					JSON.stringify(summary)
				)

				form.elements["content[problem]"].value.must.equal(
					JSON.stringify(problem)
				)

				form.elements["content[solution]"].value.must.equal(
					JSON.stringify(solution)
				)

				form.elements.language.value.must.equal(initiative.language)
				textsDb.search(sql`SELECT * FROM initiative_texts`).must.be.empty()
			})

			it("must create text and set title given unknown text sections",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					language: "en",
				}))

				var summary = newTrixDocument("World.")
				var problem = newTrixDocument("Bad world.")
				var hope = newTrixDocument("Make better.")

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Hello, world!",
						"content[summary]": JSON.stringify(summary),
						"content[problem]": JSON.stringify(problem),
						"content[hope]": JSON.stringify(hope),
						language: "en"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")

				res.headers.location.must.equal(
					`/initiatives/${initiative.id}-hello-world`
				)

				initiativesDb.read(initiative).must.eql({
					__proto__: initiative,
					title: "Hello, world!",
					slug: "hello-world"
				})

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Hello, world!",
					language: "en",
					content: {summary, problem, hope},
					content_type: TRIX_SECTIONS_TYPE
				})])
			})

			it("must create text and set title even if content empty", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					language: "en"
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					// With JavaScript disabled, content is left empty entirely when
					// creating.
					form: {title: "Hello, world!", content: "", language: "en"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")

				res.headers.location.must.equal(
					`/initiatives/${initiative.id}-hello-world`
				)

				initiativesDb.read(initiative).must.eql({
					__proto__: initiative,
					title: "Hello, world!",
					slug: "hello-world"
				})

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Hello, world!",
					language: "en",
					content: [],
					content_type: TRIX_TYPE
				})])
			})

			it("must create text and set title even if text sections empty",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					language: "en"
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					// With JavaScript disabled, content is left empty entirely when
					// creating.
					form: {
						title: "Hello, world!",
						"content[summary]": "",
						"content[problem]": "",
						"content[solution]": "",
						language: "en"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")

				res.headers.location.must.equal(
					`/initiatives/${initiative.id}-hello-world`
				)

				initiativesDb.read(initiative).must.eql({
					__proto__: initiative,
					title: "Hello, world!",
					slug: "hello-world"
				})

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Hello, world!",
					language: "en",
					content: {summary: [], problem: [], solution: []},
					content_type: TRIX_SECTIONS_TYPE
				})])
			})

			it("must skip slug if nothing remains", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					language: "en"
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {title: "!?", content: "", language: "en"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")
				res.headers.location.must.equal(`/initiatives/${initiative.id}`)

				initiativesDb.read(initiative).must.eql({
					__proto__: initiative,
					title: "!?",
					slug: null
				})

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "!?",
					language: "en",
					content: [],
					content_type: TRIX_TYPE
				})])
			})

			Config.languages.forEach(function(lang) {
				it(`must create text given translation in ${lang}`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						language: _.find(Config.languages, (l) => l != lang),
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath + "/texts", {
						method: "POST",
						form: {
							title: "Let it shine",
							content: JSON.stringify(newTrixDocument("Hello, world")),
							language: lang
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Text Created")
					initiativesDb.read(initiative).must.eql(initiative)

					textsDb.read(sql`
						SELECT COUNT(*) AS count FROM initiative_texts
					`).count.must.equal(1)
				})
			})

			it("must respond with 422 given empty title", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var content = newTrixDocument("Hello, world")

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "",
						content: JSON.stringify(content),
						language: initiative.language
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Attributes")
				initiativesDb.read(initiative).must.eql(initiative)

				var dom = parseHtml(res.body)
				var form = dom.getElementById("initiative-form")
				form.elements.title.value.must.equal(initiative.title)
				form.elements.content.value.must.equal(JSON.stringify(content))

				textsDb.search(sql`SELECT * FROM initiative_texts`).must.be.empty()
			})

			it(`must create text and set title if at most ${TITLE_MAX_LENGTH} characters`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: _.repeat("a", TITLE_MAX_LENGTH),
						content: JSON.stringify(newTrixDocument("Hello, world")),
						language: initiative.language
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")

				initiativesDb.read(initiative).must.eql({
					__proto__: initiative,
					title: _.repeat("a", TITLE_MAX_LENGTH),
					slug: _.repeat("a", SLUG_MAX_LENGTH)
				})

				textsDb.read(sql`
					SELECT COUNT(*) AS count FROM initiative_texts
				`).count.must.equal(1)
			})

			it(`must respond with 422 given title longer than ${TITLE_MAX_LENGTH} characters`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var title = _.repeat("a", TITLE_MAX_LENGTH + 1)
				var content = newTrixDocument("Hello, world")

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title,
						content: JSON.stringify(content),
						language: initiative.language
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Attributes")
				initiativesDb.read(initiative).must.eql(initiative)

				var dom = parseHtml(res.body)
				var form = dom.getElementById("initiative-form")
				form.elements.title.value.must.equal(title)
				form.elements.content.value.must.equal(JSON.stringify(content))

				textsDb.search(sql`SELECT * FROM initiative_texts`).must.be.empty()
			})

			it("must respond with 422 given invalid language for translation",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Let it shine",
						content: JSON.stringify(newTrixDocument("Hello, world")),
						language: "xx"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Attributes")
				initiativesDb.read(initiative).must.eql(initiative)
				textsDb.search(sql`SELECT * FROM initiative_texts`).must.be.empty()
			})

			it("must create text given translation in edit phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var content = newTrixDocument("Hello, world")
				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Let it shine",
						content: JSON.stringify(content),
						language: "en"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")
				initiativesDb.read(initiative).must.eql(initiative)

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Let it shine",
					language: "en",
					content: content,
					content_type: TRIX_TYPE
				})])
			})

			it("must create text given translation in sign phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var content = newTrixDocument("Hello, world")
				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Let it shine",
						content: JSON.stringify(content),
						language: "en"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")
				initiativesDb.read(initiative).must.eql(initiative)

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Let it shine",
					language: "en",
					content: content,
					content_type: TRIX_TYPE
				})])
			})

			it("must create text if coauthor", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var content = newTrixDocument("How are you?")
				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",

					form: {
						title: initiative.title,
						content: JSON.stringify(content),
						language: "et"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")

				textsDb.read(sql`
					SELECT * FROM initiative_texts LIMIT 1
				`).must.eql(new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: initiative.title,
					content: content,
					content_type: TRIX_TYPE
				}))
			})

			it("must create text given basis", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var basis = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id
				}))

				var content = newTrixDocument("How are you?")
				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",

					form: {
						"basis-id": basis.id,
						title: initiative.title,
						content: JSON.stringify(content),
						language: basis.language
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")

				textsDb.read(sql`
					SELECT * FROM initiative_texts WHERE id = 2
				`).must.eql(new ValidText({
					id: 2,
					basis_id: basis.id,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: initiative.title,
					content: content,
					content_type: TRIX_TYPE
				}))
			})

			it("must ignore basis if from another initiative", function*() {
				var other = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var basis = textsDb.create(new ValidText({
					initiative_uuid: other.uuid,
					user_id: this.user.id,
					title: other.title
				}))

				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						"basis-id": basis.id,
						language: basis.language,
						title: initiative.title,
						content: "[]"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")

				textsDb.read(sql`
					SELECT * FROM initiative_texts WHERE id = 2
				`).must.eql(new ValidText({
					id: 2,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: initiative.title,
					content: [],
					content_type: TRIX_TYPE
				}))
			})

			// <form>s may send valueless <input>s as empty strings.
			it("must ignore basis if empty string", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {title: "Hello", "basis-id": "", language: "et", content: "[]"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")
			})

			it("must create text if initiative published", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: new Date
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {title: "Hello", language: "et", content: "[]"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_TEXT_CREATED_IF_PUBLISHED"))
			})

			it("must not update other attributes", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var content = newTrixDocument("Hello, world")
				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Let it shine",
						content: JSON.stringify(content),
						language: "en",
						phase: "sign",
						user_id: 42
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Text Created")
				initiativesDb.read(initiative).must.eql(initiative)

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Let it shine",
					language: "en",
					content: content,
					content_type: TRIX_TYPE
				})])
			})
		})
	})

	describe("GET /new", function() {
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render page if no existing texts", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts/new")
				res.statusCode.must.equal(200)
			})

			it("must render page if coauthor", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts/new")
				res.statusCode.must.equal(200)
			})

			it("must render Trix text if primary text not with sections",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id,
					content_type: TRIX_TYPE,
					language: initiative.language
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts/new?language=en")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var form = dom.getElementById("initiative-form")
				form.elements.title.value.must.equal(initiative.title)
				form.elements.content.value.must.equal("")
			})

			it("must render Trix text sections if no primary",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts/new?language=en")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var form = dom.getElementById("initiative-form")
				form.elements.title.value.must.equal(initiative.title)
				form.elements["content[summary]"].value.must.equal("")
				form.elements["content[problem]"].value.must.equal("")
				form.elements["content[solution]"].value.must.equal("")
			})

			it("must render Trix text sections if primary text with sections",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id,
					content_type: TRIX_SECTIONS_TYPE
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts/new?language=en")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var form = dom.getElementById("initiative-form")
				form.elements.title.value.must.equal(initiative.title)
				form.elements["content[summary]"].value.must.equal("")
				form.elements["content[problem]"].value.must.equal("")
				form.elements["content[solution]"].value.must.equal("")
			})
		})
	})

	describe("GET /:id", function() {
		describe("when not logged in", function() {
			it("must respond with 401 if not published", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it("must respond with 401 if published", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					published_at: new Date
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not the author", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					published_at: new Date
				}))

				var res = yield this.request(`/initiatives/${initiative.id}/edit`)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})

			it("must respond with 403 if no longer in edit or sign phase",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "parliament"
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not Editable")
			})

			it("must render read-only warning if in sign phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(200)
				res.body.must.include(t("UPDATE_INITIATIVE_READONLY"))
			})

			it("must not render read-only warning on translation if in sign phase",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id,
					language: "en"
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("UPDATE_INITIATIVE_READONLY"))
			})

			it("must render if coauthor", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(200)
			})

			describe("given Trix", function() {
				it("must render", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var content = newTrixDocument("Make the world better.")

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: initiative.user_id,
						content
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.getElementById("initiative-form")
					form.elements.title.value.must.equal(text.title)
					form.elements.content.value.must.equal(JSON.stringify(content))
				})
			})

			describe("given Trix text sections", function() {
				it("must render", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var summary = newTrixDocument("World.")
					var problem = newTrixDocument("Bad world.")
					var solution = newTrixDocument("Make better.")

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: initiative.user_id,
						content: {summary, problem, solution},
						content_type: TRIX_SECTIONS_TYPE
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.getElementById("initiative-form")
					form.elements.title.value.must.equal(text.title)

					form.elements["content[summary]"].value.must.equal(
						JSON.stringify(summary)
					)

					form.elements["content[problem]"].value.must.equal(
						JSON.stringify(problem)
					)

					form.elements["content[solution]"].value.must.equal(
						JSON.stringify(solution)
					)
				})

				it("must ignore unknown sections", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var summary = newTrixDocument("World.")
					var problem = newTrixDocument("Bad world.")
					var hope = newTrixDocument("Make better.")

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: initiative.user_id,
						content: {summary, problem, hope},
						content_type: TRIX_SECTIONS_TYPE
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.getElementById("initiative-form")

					form.elements["content[summary]"].value.must.equal(
						JSON.stringify(summary)
					)

					form.elements["content[problem]"].value.must.equal(
						JSON.stringify(problem)
					)

					form.elements["content[solution]"].value.must.equal("")
				})
			})

			describe("given CitizenOS HTML", function() {
				function forEachHeader(fn) { _.times(6, (i) => fn(`h${i + 1}`)) }

				// Initiative with id 1f821c9e-1b93-4ef5-947f-fe0be45855c5 has the main
				// title with <h2>, not <h1>.
				forEachHeader(function(tagName) {
					it(`must remove title from first <${tagName}>`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id
						}))

						var text = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
							content_type: "application/vnd.citizenos.etherpad+html",
							content: outdent`
								<!DOCTYPE HTML>
								<html>
									<body>
										<${tagName}>Vote for Peace</${tagName}>
										<p>Rest in peace!</p>
									</body>
								</html>
							`
						}))

						var initiativePath = `/initiatives/${initiative.id}`
						var res = yield this.request(initiativePath + "/texts/" + text.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var input = dom.querySelector("input[name=content]")

						JSON.parse(input.value).must.equal(outdent`
							<!DOCTYPE HTML>
							<html>
								<body><p>Rest in peace!</p></body>
							</html>
						`)
					})
				})

				it("must remove title from multiline <h1>", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<h1>
										Vote for Peace
									</h1>
									<p>Rest in peace!</p>
								</body>
							</html>
						`
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must remove single title given multiple <h1>", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<h1>Vote for Peace</h1>
									<h1>Vote for Terror</h1>
									<p>Rest in peace!</p>
								</body>
							</html>
						`
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><h1>Vote for Terror</h1>
							\t<p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must remove title given multiple empty and blank <h1>s",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<h1></h1>
									<h1> </h1>
									<h1>Vote for Peace</h1>
									<p>Rest in peace!</p>
								</body>
							</html>
						`
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must remove title given multiple empty and blank <h2>s",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<h2></h2>
									<h2> </h2>
									<h2>Vote for Peace</h2>
									<p>Rest in peace!</p>
								</body>
							</html>
						`
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must strip leading and trailing <br>s", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<br>
									<br>
									<h1>Vote for Peace</h1>
									<br>
									<br>
									<p>Rest in peace!</p>
									<br>
									<br>
								</body>
							</html>
						`
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				forEachHeader(function(tagName) {
					it(`must strip <br>s around <${tagName}>s`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id
						}))

						var text = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
							content_type: "application/vnd.citizenos.etherpad+html",
							content: outdent`
								<!DOCTYPE HTML>
								<html>
									<body>
										<h1>Vote for Peace</h1>
										<p>Indeed</p>
										<br>
										<br>
										<${tagName}>Reasons</${tagName}>
										<br>
										<br>
										<p>Because.</p>
									</body>
								</html>
							`
						}))

						var initiativePath = `/initiatives/${initiative.id}`
						var res = yield this.request(initiativePath + "/texts/" + text.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var input = dom.querySelector("input[name=content]")

						JSON.parse(input.value).must.equal(outdent`
							<!DOCTYPE HTML>
							<html>
								<body><p>Indeed</p>
									<${tagName}>Reasons</${tagName}>
									<p>Because.</p></body>
							</html>
						`)
					})
				})
			})
		})
	})
})

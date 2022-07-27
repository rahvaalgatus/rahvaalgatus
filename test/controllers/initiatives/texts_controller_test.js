var _ = require("root/lib/underscore")
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
var parseCookies = require("root/test/web").parseCookies
var TRIX_TYPE = new MediaType("application/vnd.basecamp.trix+json")
var {newTrixDocument} = require("root/test/fixtures")
var outdent = require("root/lib/outdent")
var parseDom = require("root/lib/dom").parse

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
					form: {content: "[]"}
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
					form: {content: "[]"}
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
					form: {content: "[]"}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})

			it("must respond with 403 if no longer in edit or sign phase",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "parliament"
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]"}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.must.equal("Not Editable")
			})

			it("must respond with 405 if in sign phase given no language",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]"}
				})

				res.statusCode.must.equal(405)
				res.statusMessage.must.must.equal("Can Only Add Translations")
			})

			it("must respond with 405 if in sign phase given initiative's language",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					language: "en"
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {content: "[]", language: "en"}
				})

				res.statusCode.must.equal(405)
				res.statusMessage.must.must.equal("Can Only Add Translations")
			})

			it("must create new text and set title", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					language: "en"
				}))

				var content = newTrixDocument("Hello, world")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Let it shine",
						content: JSON.stringify(content),
						language: "en"
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
				`).must.then.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Let it shine",
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

			it("must create new text and set title even if content empty",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					language: "en"
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					// With JavaScript disabled, content is left empty entirely when
					// creating.
					form: {title: "Let it shine", content: "", language: "en"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

				yield initiativesDb.read(initiative).must.then.eql({
					__proto__: initiative,
					title: "Let it shine"
				})

				yield textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.then.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Let it shine",
					language: "en",
					content: [],
					content_type: TRIX_TYPE
				})])
			})

			it("must create new text given translation in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var content = newTrixDocument("Hello, world")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Let it shine",
						content: JSON.stringify(content),
						language: "en"
					}
				})

				res.statusCode.must.equal(302)

				yield initiativesDb.read(initiative).must.then.eql(initiative)

				yield textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.then.eql([new ValidText({
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

			it("must create new text given translation in sign phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var content = newTrixDocument("Hello, world")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						title: "Let it shine",
						content: JSON.stringify(content),
						language: "en"
					}
				})

				res.statusCode.must.equal(302)

				yield initiativesDb.read(initiative).must.then.eql(initiative)

				yield textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.then.eql([new ValidText({
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

			it("must create new text if coauthor", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var content = newTrixDocument("How are you?")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",

					form: {
						title: initiative.title,
						content: JSON.stringify(content),
						language: "et"
					}
				})

				res.statusCode.must.equal(302)

				yield textsDb.read(sql`
					SELECT * FROM initiative_texts LIMIT 1
				`).must.then.eql(new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: initiative.title,
					content: content,
					content_type: TRIX_TYPE
				}))
			})

			it("must create new text given basis", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var basis = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id
				}))

				var content = newTrixDocument("How are you?")
				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",

					form: {
						"basis-id": basis.id,
						title: initiative.title,
						content: JSON.stringify(content),
						language: basis.language
					}
				})

				res.statusCode.must.equal(302)

				yield textsDb.read(sql`
					SELECT * FROM initiative_texts WHERE id = 2
				`).must.then.eql(new ValidText({
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
				var other = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var basis = yield textsDb.create(new ValidText({
					initiative_uuid: other.uuid,
					user_id: this.user.id,
					title: other.title
				}))

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {
						"basis-id": basis.id,
						language: basis.language,
						title: initiative.title,
						content: "[]"
					}
				})

				res.statusCode.must.equal(302)

				yield textsDb.read(sql`
					SELECT * FROM initiative_texts WHERE id = 2
				`).must.then.eql(new ValidText({
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
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = "/initiatives/" + initiative.uuid
				var res = yield this.request(initiativePath + "/texts", {
					method: "POST",
					form: {"basis-id": "", language: "et", content: "[]"}
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
					form: {language: "et", content: "[]"}
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

	describe("GET /new", function() {
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render page if no existing texts", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/new")
				res.statusCode.must.equal(200)
			})

			it("must render page if coauthor", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/new")
				res.statusCode.must.equal(200)
			})
		})
	})

	describe("GET /:id", function() {
		describe("when not logged in", function() {
			it("must respond with 401 if not published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it("must respond with 401 if published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
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

				var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})

			it("must respond with 403 if no longer in edit or sign phase",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "parliament"
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not Editable")
			})

			it("must render read-only warning if in sign phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(200)
				res.body.must.include(t("UPDATE_INITIATIVE_READONLY"))
			})

			it("must not render read-only warning on translation if in sign phase",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id,
					language: "en"
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("UPDATE_INITIATIVE_READONLY"))
			})

			it("must render if coauthor", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: initiative.user_id
				}))

				var initiativePath = `/initiatives/${initiative.uuid}`
				var res = yield this.request(initiativePath + "/texts/" + text.id)
				res.statusCode.must.equal(200)
			})

			describe("given CitizenOS HTML", function() {
				function forEachHeader(fn) { _.times(6, (i) => fn(`h${i + 1}`)) }

				// Initiative with id 1f821c9e-1b93-4ef5-947f-fe0be45855c5 has the main
				// title with <h2>, not <h1>.
				forEachHeader(function(tagName) {
					it(`must remove title from first <${tagName}>`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id
						}))

						var text = yield textsDb.create(new ValidText({
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

						var initiativePath = `/initiatives/${initiative.uuid}`
						var res = yield this.request(initiativePath + "/texts/" + text.id)
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = yield textsDb.create(new ValidText({
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

					var initiativePath = `/initiatives/${initiative.uuid}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must remove single title given multiple <h1>", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = yield textsDb.create(new ValidText({
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

					var initiativePath = `/initiatives/${initiative.uuid}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = yield textsDb.create(new ValidText({
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

					var initiativePath = `/initiatives/${initiative.uuid}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = yield textsDb.create(new ValidText({
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

					var initiativePath = `/initiatives/${initiative.uuid}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must strip leading and trailing <br>s", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var text = yield textsDb.create(new ValidText({
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

					var initiativePath = `/initiatives/${initiative.uuid}`
					var res = yield this.request(initiativePath + "/texts/" + text.id)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
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
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id
						}))

						var text = yield textsDb.create(new ValidText({
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

						var initiativePath = `/initiatives/${initiative.uuid}`
						var res = yield this.request(initiativePath + "/texts/" + text.id)
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
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

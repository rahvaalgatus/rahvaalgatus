var _ = require("root/lib/underscore")
var Http = require("root/lib/http")
var Config = require("root/config")
var ValidUser = require("root/test/valid_user")
var ValidCoauthor = require("root/test/valid_initiative_coauthor")
var ValidInitiative = require("root/test/valid_initiative")
var initiativesDb = require("root/db/initiatives_db")
var coauthorsDb = require("root/db/initiative_coauthors_db")
var usersDb = require("root/db/users_db")
var parseDom = require("root/lib/dom").parse
var parseCookies = Http.parseCookies
var demand = require("must")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var sql = require("sqlate")
var {STATUSES} = require("root/controllers/initiatives/coauthors_controller")

describe("InitiativeAuthorsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/fixtures").csrf()
	require("root/test/time")()
	beforeEach(require("root/test/mitm").router)

	describe("GET /", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path)
				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not author", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit Coauthors")
			})

			it("must respond with 403 if coauthor", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit Coauthors")
			})

			it("must respond with empty coauthors page", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var table = dom.getElementById("accepted-coauthors")
				table.tBodies[0].rows.length.must.equal(1)
			})

			it(`must render pending coauthors as pending`, function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var coauthors = yield usersDb.create(_.times(3, () => new ValidUser))

				yield coauthorsDb.create(coauthors.map((author) => new ValidCoauthor({
					initiative: initiative,
					country: author.country,
					personal_id: author.personal_id,
					status: "pending"
				})))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var table = dom.getElementById("pending-coauthors")
				table.tBodies[0].rows.length.must.equal(3)
				table.tBodies[0].textContent.must.include(coauthors[0].personal_id)
				table.tBodies[0].textContent.must.include(coauthors[1].personal_id)
				table.tBodies[0].textContent.must.include(coauthors[2].personal_id)
				res.body.must.not.include(coauthors[0].name)
				res.body.must.not.include(coauthors[1].name)
				res.body.must.not.include(coauthors[2].name)
			})

			it("must render with accepted coauthors", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var coauthors = yield usersDb.create(_.times(3, () => new ValidUser))

				yield coauthorsDb.create(coauthors.map((coauthor) => new ValidCoauthor({
					initiative: initiative,
					user: coauthor,
					status: "accepted"
				})))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var table = dom.getElementById("accepted-coauthors")
				table.tBodies[0].rows.length.must.equal(4)
				table.tBodies[0].textContent.must.include(coauthors[0].name)
				table.tBodies[0].textContent.must.include(coauthors[1].name)
				table.tBodies[0].textContent.must.include(coauthors[2].name)
			})

			_.without(STATUSES, "accepted", "pending").forEach(function(status) {
				it(`must not render ${status} coauthors`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var coauthor = yield usersDb.create(new ValidUser)

					yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: coauthor,
						status: status
					}))

					var path = `/initiatives/${initiative.uuid}/coauthors`
					var res = yield this.request(path)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var table = dom.getElementById("accepted-coauthors")
					table.tBodies[0].rows.length.must.equal(1)
					demand(dom.getElementById("pending-coauthors")).be.null()
					res.body.must.not.include(coauthor.name)
				})
			})

			it("must not render coauthors from other initiatives", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var other = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var coauthors = yield usersDb.create(_.times(5, () => new ValidUser))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative: other,
					country: coauthors[0].country,
					personal_id: coauthors[0].personal_id,
					status: "pending"
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative: other,
					country: coauthors[1].country,
					personal_id: coauthors[1].personal_id,
					status: "cancelled"
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative: other,
					user: coauthors[2],
					status: "rejected"
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative: other,
					user: coauthors[3],
					status: "accepted"
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative: other,
					user: coauthors[4],
					status: "removed"
				}))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var table = dom.getElementById("accepted-coauthors")
				table.tBodies[0].rows.length.must.equal(1)
				demand(dom.getElementById("pending-coauthors")).be.null()

				coauthors.forEach(function(coauthor) {
					res.body.must.not.include(coauthor.name)
				})
			})
		})
	})

	describe("POST /", function() {
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not author", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path, {method: "POST"})
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit Coauthors")
			})

			it("must respond with 403 if coauthor", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				yield coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path, {method: "POST"})
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit Coauthors")
			})

			it("must create a new pending coauthor", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path, {
					method: "POST",
					form: {personalId: "38706181337"}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(path)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("COAUTHORS_PAGE_COAUTHOR_ADDED"))

				yield coauthorsDb.search(sql`
					SELECT * FROM initiative_coauthors
				`).must.then.eql([new ValidCoauthor({
					id: 1,
					initiative: initiative,
					personal_id: "38706181337",
					status: "pending"
				})])
			})

			it("must ignore given user's own personal id", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path, {
					method: "POST",
					form: {personalId: this.user.personal_id}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(path)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("COAUTHORS_PAGE_COAUTHOR_YOURSELF"))

				yield coauthorsDb.search(sql`
					SELECT * FROM initiative_coauthors
				`).must.then.be.empty()
			})

			it("must ignore duplicate coauthor", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var coauthor = yield coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					personal_id: "38706181337",
					status: "pending"
				}))

				var path = `/initiatives/${initiative.uuid}/coauthors`
				var res = yield this.request(path, {
					method: "POST",
					form: {personalId: "38706181337"}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(path)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					cookies: _.mapValues(cookies, (c) => c.value)
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("COAUTHORS_PAGE_COAUTHOR_DUPLICATE"))

				yield coauthorsDb.search(sql`
					SELECT * FROM initiative_coauthors
				`).must.then.eql([coauthor])
			})

			_.without(STATUSES, "accepted", "pending").forEach(function(status) {
				it(`must create a new pending coauthor if previously ${status}`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var otherUser = yield usersDb.create(new ValidUser)

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: otherUser,
						status: status
					}))

					var path = `/initiatives/${initiative.uuid}/coauthors`
					var res = yield this.request(path, {
						method: "POST",
						form: {personalId: otherUser.personal_id}
					})

					res.statusCode.must.equal(303)

					yield coauthorsDb.search(sql`
						SELECT * FROM initiative_coauthors
					`).must.then.eql([coauthor, new ValidCoauthor({
						id: 2,
						initiative: initiative,
						user: otherUser,
						status: "pending"
					})])
				})
			})
		})
	})

	describe("PUT /:personalId", function() {
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			describe("when author", function() {
				it("must respond with 404", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						published_at: new Date
					}))

					var res = yield this.request(pathToCoauthor(initiative, this.user), {
						method: "PUT",
						form: {status: "accepted"}
					})

					res.statusCode.must.equal(404)
					res.statusMessage.must.equal("No Invitation")
				})
			})

			describe("when coauthor", function() {
				it("must respond with 403 if signed in with another country",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var path = `/initiatives/${initiative.uuid}/coauthors/`
					path += "/LV" + this.user.personal_id
					var res = yield this.request(path, {
						method: "PUT",
						form: {status: "accepted"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Not Your Invitation")
				})

				it("must respond with 403 if signed in with another personal id",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var path = `/initiatives/${initiative.uuid}/coauthors/`
					path += "/" + this.user.country + "40001011337"
					var res = yield this.request(path, {
						method: "PUT",
						form: {status: "accepted"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Not Your Invitation")
				})

				it("must respond with 404 if not invited", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var res = yield this.request(pathToCoauthor(initiative, this.user), {
						method: "PUT",
						form: {status: "accepted"}
					})

					res.statusCode.must.equal(404)
					res.statusMessage.must.equal("No Invitation")
				})

				it("must respond with 404 if other initiative invited", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var otherInitiative = yield initiativesDb.create(new ValidInitiative({
						user_id: initiative.user_id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: otherInitiative,
						user: this.user,
						status: "pending"
					}))

					var res = yield this.request(pathToCoauthor(initiative, this.user), {
						method: "PUT",
						form: {status: "accepted"}
					})

					res.statusCode.must.equal(404)
					res.statusMessage.must.equal("No Invitation")

					yield coauthorsDb.read(sql`
						SELECT * FROM initiative_coauthors
					`).must.then.eql(coauthor)
				})

				it("must respond with 404 if other country invited", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						country: "LV",
						personal_id: this.user.personal_id,
						status: "pending"
					}))

					var res = yield this.request(pathToCoauthor(initiative, this.user), {
						method: "PUT",
						form: {status: "accepted"}
					})

					res.statusCode.must.equal(404)
					res.statusMessage.must.equal("No Invitation")

					yield coauthorsDb.read(sql`
						SELECT * FROM initiative_coauthors
					`).must.then.eql(coauthor)
				})

				it("must respond with 404 if other personal id invited", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						country: this.user.country,
						personal_id: "40001011337",
						status: "pending"
					}))

					var res = yield this.request(pathToCoauthor(initiative, this.user), {
						method: "PUT",
						form: {status: "accepted"}
					})

					res.statusCode.must.equal(404)
					res.statusMessage.must.equal("No Invitation")

					yield coauthorsDb.read(sql`
						SELECT * FROM initiative_coauthors
					`).must.then.eql(coauthor)
				})

				;["accepted", "rejected"].forEach(function(status) {
					it(`must respond with 405 if already ${status}`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: (yield usersDb.create(new ValidUser)).id,
							published_at: new Date
						}))

						yield coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: status
						}))

						var path = pathToCoauthor(initiative, this.user)
						var res = yield this.request(path, {
							method: "PUT",
							form: {status: "accepted"}
						})

						res.statusCode.must.equal(405)
						res.statusMessage.must.equal("Already Responded")
					})
				})

				it("must accept invitation to unpublished initiative", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						country: this.user.country,
						personal_id: this.user.personal_id,
						status: "pending"
					}))

					var res = yield this.request(pathToCoauthor(initiative, this.user), {
						method: "PUT",
						form: {status: "accepted"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Invitation Accepted")
					res.headers.location.must.equal("/user")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						cookies: _.mapValues(cookies, (c) => c.value)
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("USER_PAGE_COAUTHOR_INVITATION_ACCEPTED"))

					yield coauthorsDb.read(sql`
						SELECT * FROM initiative_coauthors
					`).must.then.eql({
						__proto__: coauthor,
						user_id: this.user.id,
						status: "accepted",
						status_updated_at: new Date,
						status_updated_by_id: this.user.id
					})
				})

				it("must accept invitation to published initiative", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						country: this.user.country,
						personal_id: this.user.personal_id,
						status: "pending"
					}))

					var res = yield this.request(pathToCoauthor(initiative, this.user), {
						method: "PUT",
						form: {status: "accepted"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Invitation Accepted")
					res.headers.location.must.equal("/user")
				})

				it("must reject invitation", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						country: this.user.country,
						personal_id: this.user.personal_id,
						status: "pending"
					}))

					var res = yield this.request(pathToCoauthor(initiative, this.user), {
						method: "PUT",
						form: {status: "rejected"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Invitation Rejected")
					res.headers.location.must.equal("/user")

					yield coauthorsDb.read(sql`
						SELECT * FROM initiative_coauthors
					`).must.then.eql({
						__proto__: coauthor,
						user_id: this.user.id,
						status: "rejected",
						status_updated_at: new Date,
						status_updated_by_id: this.user.id
					})
				})

				_.without(STATUSES, "accepted", "pending").forEach(function(status) {
					it(`must accept invitation if previously ${status}`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: (yield usersDb.create(new ValidUser)).id,
							published_at: new Date
						}))

						var oldCoauthor = yield coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: status
						}))

						var coauthor = yield coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: "pending"
						}))

						var res = yield this.request(pathToCoauthor(initiative, this.user), {
							method: "PUT",
							form: {status: "accepted"}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Invitation Accepted")

						yield coauthorsDb.search(sql`
							SELECT * FROM initiative_coauthors
						`).must.then.eql([oldCoauthor, {
							__proto__: coauthor,
							user_id: this.user.id,
							status: "accepted",
							status_updated_at: new Date,
							status_updated_by_id: this.user.id
						}])
					})
				})

				_.without(STATUSES, "accepted", "rejected").forEach(function(status) {
					it(`must respond with 422 given ${status} status`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: (yield usersDb.create(new ValidUser)).id,
							published_at: new Date
						}))

						var coauthor = yield coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: "pending"
						}))

						var path = pathToCoauthor(initiative, this.user)
						var res = yield this.request(path, {
							method: "PUT",
							form: {status: status}
						})

						res.statusCode.must.equal(422)
						res.statusMessage.must.equal("Invalid Status")

						yield coauthorsDb.read(sql`
							SELECT * FROM initiative_coauthors
						`).must.then.eql(coauthor)
					})
				})

				it("must respond with 422 given invalid status", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						country: this.user.country,
						personal_id: this.user.personal_id,
						status: "pending"
					}))

					var res = yield this.request(pathToCoauthor(initiative, this.user), {
						method: "PUT",
						form: {status: "foobar"}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Invalid Status")

					yield coauthorsDb.read(sql`
						SELECT * FROM initiative_coauthors
					`).must.then.eql(coauthor)
				})

				it("must redirect to referrer from header", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						country: this.user.country,
						personal_id: this.user.personal_id,
						status: "pending"
					}))

					var res = yield this.request(pathToCoauthor(initiative, this.user), {
						method: "PUT",
						headers: {Referer: this.url + "/foo"},
						form: {status: "accepted"}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(this.url + "/foo")
				})

				it("must redirect to referrer from form", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						country: this.user.country,
						personal_id: this.user.personal_id,
						status: "pending"
					}))

					var res = yield this.request(pathToCoauthor(initiative, this.user), {
						method: "PUT",
						headers: {Referer: this.url + "/foo"},
						form: {referrer: this.url + "/bar", status: "accepted"}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(this.url + "/bar")
				})
			})
		})
	})

	describe("DELETE /:personalId", function() {
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 404 if not found", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: new Date
				}))

				var user = yield usersDb.create(new ValidUser)

				var res = yield this.request(pathToCoauthor(initiative, user), {
					method: "DELETE"
				})

				res.statusCode.must.equal(404)
				res.statusMessage.must.equal("Coauthor Not Found")
			})

			describe("when author", function() {
				it("must respond with 403 if not author", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: yield usersDb.create(new ValidUser),
						status: "accepted"
					}))

					var res = yield this.request(pathToCoauthor(initiative, coauthor), {
						method: "DELETE"
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Permission to Edit Coauthors")
				})

				it("must delete pending coauthor", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: yield usersDb.create(new ValidUser),
						status: "pending"
					}))

					var res = yield this.request(pathToCoauthor(initiative, coauthor), {
						method: "DELETE"
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Coauthor Invitation Cancelled")

					res.headers.location.must.equal(
						`/initiatives/${initiative.uuid}/coauthors`
					)

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						cookies: _.mapValues(cookies, (c) => c.value)
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("COAUTHORS_PAGE_COAUTHOR_DELETED"))

					yield coauthorsDb.read(sql`
						SELECT * FROM initiative_coauthors
					`).must.then.eql({
						__proto__: coauthor,
						status: "cancelled",
						status_updated_at: new Date,
						status_updated_by_id: this.user.id
					})
				})

				it("must delete accepted coauthor", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: yield usersDb.create(new ValidUser),
						status: "accepted"
					}))

					var res = yield this.request(pathToCoauthor(initiative, coauthor), {
						method: "DELETE"
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Coauthor Removed")

					res.headers.location.must.equal(
						`/initiatives/${initiative.uuid}/coauthors`
					)

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						cookies: _.mapValues(cookies, (c) => c.value)
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("COAUTHORS_PAGE_COAUTHOR_DELETED"))

					yield coauthorsDb.read(sql`
						SELECT * FROM initiative_coauthors
					`).must.then.eql({
						__proto__: coauthor,
						status: "removed",
						status_updated_at: new Date,
						status_updated_by_id: this.user.id
					})
				})

				_.without(STATUSES, "accepted", "pending").forEach(function(status) {
					it(`must delete latest pending coauthor if previously ${status}`,
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							published_at: new Date
						}))

						var otherUser = yield usersDb.create(new ValidUser)

						var oldCoauthor = yield coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: otherUser,
							status: status
						}))

						var coauthor = yield coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: otherUser,
							status: "pending"
						}))

						var res = yield this.request(pathToCoauthor(initiative, coauthor), {
							method: "DELETE"
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Coauthor Invitation Cancelled")

						yield coauthorsDb.search(sql`
							SELECT * FROM initiative_coauthors
						`).must.then.eql([oldCoauthor, {
							__proto__: coauthor,
							status: "cancelled",
							status_updated_at: new Date,
							status_updated_by_id: this.user.id
						}])
					})
				})

				_.without(
					STATUSES,
					"accepted",
					"pending",
					"cancelled",
					"removed",
					"resigned",
					"rejected"
				).forEach(function(status) {
					it(`must respond with 405 given ${status}`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							published_at: new Date
						}))

						var coauthor = yield coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: yield usersDb.create(new ValidUser),
							status: status
						}))

						var res = yield this.request(pathToCoauthor(initiative, coauthor), {
							method: "DELETE"
						})

						res.statusCode.must.equal(405)
						res.statusMessage.must.equal("Coauthor Not Deletable")
					})
				})
			})

			describe("when coauthor", function() {
				it("must respond with 404 if coauthor from another initiative",
					function*() {
					var author = yield usersDb.create(new ValidUser)

					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: author.id,
						published_at: new Date
					}))

					var otherInitiative = yield initiativesDb.create(new ValidInitiative({
						user_id: author.id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: otherInitiative,
						user: this.user,
						status: "accepted"
					}))

					var path = pathToCoauthor(initiative, coauthor)
					var res = yield this.request(path, {method: "DELETE"})
					res.statusCode.must.equal(404)
					res.statusMessage.must.equal("Coauthor Not Found")
				})

				it("must respond with 404 if coauthor from another country", function*() {
					var author = yield usersDb.create(new ValidUser)

					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: author.id,
						published_at: new Date
					}))

					var otherUser = yield usersDb.create(new ValidUser({
						country: "LT",
						personal_id: this.user.personal_id
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: otherUser,
						status: "accepted"
					}))

					var path = pathToCoauthor(initiative, this.user)
					var res = yield this.request(path, {method: "DELETE"})
					res.statusCode.must.equal(404)
					res.statusMessage.must.equal("Coauthor Not Found")
				})

				it("must respond with 404 if coauthor from another country", function*() {
					var author = yield usersDb.create(new ValidUser)

					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: author.id,
						published_at: new Date
					}))

					var otherUser = yield usersDb.create(new ValidUser({
						country: this.user.country
					}))

					yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: otherUser,
						status: "accepted"
					}))

					var path = pathToCoauthor(initiative, this.user)
					var res = yield this.request(path, {method: "DELETE"})
					res.statusCode.must.equal(404)
					res.statusMessage.must.equal("Coauthor Not Found")
				})

				it("must reject if pending coauthor", function*() {
					var author = yield usersDb.create(new ValidUser)

					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: author.id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "pending"
					}))

					var res = yield this.request(pathToCoauthor(initiative, coauthor), {
						method: "DELETE"
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Invitation Rejected")
					res.headers.location.must.equal("/user")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						cookies: _.mapValues(cookies, (c) => c.value)
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("USER_PAGE_COAUTHOR_INVITATION_REJECTED"))

					yield coauthorsDb.read(sql`
						SELECT * FROM initiative_coauthors
					`).must.then.eql({
						__proto__: coauthor,
						user_id: this.user.id,
						status: "rejected",
						status_updated_at: new Date,
						status_updated_by_id: this.user.id
					})
				})

				it("must resign if accepted coauthor", function*() {
					var author = yield usersDb.create(new ValidUser)

					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: author.id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					var res = yield this.request(pathToCoauthor(initiative, coauthor), {
						method: "DELETE"
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Coauthor Resigned")
					res.headers.location.must.equal("/user")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						cookies: _.mapValues(cookies, (c) => c.value)
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("INITIATIVE_COAUTHOR_DELETED_SELF"))

					yield coauthorsDb.read(sql`
						SELECT * FROM initiative_coauthors
					`).must.then.eql({
						__proto__: coauthor,
						status: "resigned",
						status_updated_at: new Date,
						status_updated_by_id: this.user.id
					})
				})

				_.without(STATUSES, "accepted", "pending").forEach(function(status) {
					it(`must resign latest accepted coauthor if previously ${status}`,
						function*() {
						var author = yield usersDb.create(new ValidUser)

						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: author.id,
							published_at: new Date
						}))

						var oldCoauthor = yield coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: status
						}))

						var coauthor = yield coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: "accepted"
						}))

						var res = yield this.request(pathToCoauthor(initiative, coauthor), {
							method: "DELETE"
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Coauthor Resigned")

						yield coauthorsDb.search(sql`
							SELECT * FROM initiative_coauthors
						`).must.then.eql([oldCoauthor, {
							__proto__: coauthor,
							status: "resigned",
							status_updated_at: new Date,
							status_updated_by_id: this.user.id
						}])
					})
				})
			})

			_.each({
				cancelled: "Coauthor Invitation Already Cancelled",
				removed: "Coauthor Already Removed",
				resigned: "Coauthor Already Resigned",
				rejected: "Coauthor Already Rejected"
			}, function(message, status) {
				it(`must respond with 410 given ${status} coauthor`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						published_at: new Date
					}))

					var coauthor = yield coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: yield usersDb.create(new ValidUser),
						status: status
					}))

					var res = yield this.request(pathToCoauthor(initiative, coauthor), {
						method: "DELETE"
					})

					res.statusCode.must.equal(410)
					res.statusMessage.must.equal(message)
				})
			})
		})
	})
})

function pathToCoauthor(initiative, user) {
	var path = `/initiatives/${initiative.uuid}/coauthors/`
	return path + "/" + user.country + user.personal_id
}

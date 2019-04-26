var O = require("oolong")
var Config = require("root/config")
var ValidDbInitiative = require("root/test/valid_db_initiative")
var initiativesDb = require("root/db/initiatives_db")
var respond = require("root/test/fixtures").respond
var job = require("root/jobs/parliament_monitor_job")
var sqlite = require("root").sqlite
var sql = require("sqlate")

var COMPLETED_INITIATIVE = {
	id: "d597d201-1758-4c5b-8e62-6415d397983f",
	createdAt: new Date(2000, 0, 1),
	status: "closed",
	description: "<body><h1>My thoughts.</h1></body>",
	creator: {name: "John"},
	visibility: "public",
	permission: {level: "read"},
	vote: {options: {rows: [{value: "Yes", voteCount: 0}]}}
}

describe("ParliamentMonitorJob", function() {
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	beforeEach(require("root/test/mitm").router)

	it("must request from parliament", function*() {
		this.router.get("/api/documents/collective-addresses", function(req, res) {
			req.headers.host.must.equal("aavik.riigikogu.ee")
			respond([], req, res)
		})

		yield job()
	})

	it("must set initiatives' parliament API properties and email", function*() {
		var uuid = "a8166697-7f68-43e4-a729-97a7868b4d51"
		yield initiativesDb.create({uuid: uuid})

		var parliamentApiData = {
			uuid: "dcccf075-9da3-4224-96fb-8831e485a1be",
			senderReference: uuid,
			title: "Speech of freedom!"
		}

		this.router.get("/api/documents/collective-addresses", respond.bind(null, [
			parliamentApiData
		]))

		yield job()

		yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([
			new ValidDbInitiative({
				uuid: uuid,
				parliament_api_data: JSON.stringify(parliamentApiData)
			})
		])

		this.emails.length.must.equal(1)
		this.emails[0].envelope.to.must.eql(Config.notificationEmails)
	})

	it("must create db initiative if CitizenOS says it exists", function*() {
		var uuid = COMPLETED_INITIATIVE.id

		var parliamentApiData = {
			uuid: "dcccf075-9da3-4224-96fb-8831e485a1be",
			senderReference: uuid,
			title: "Speech of freedom!"
		}

		this.router.get("/api/documents/collective-addresses", respond.bind(null, [
			parliamentApiData
		]))

		this.router.get(`/api/topics/${uuid}`, respond.bind(null, {
			data: COMPLETED_INITIATIVE
		}))

		yield job()

		yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([
			new ValidDbInitiative({
				uuid: uuid,
				parliament_api_data: JSON.stringify(parliamentApiData)
			})
		])

		this.emails.length.must.equal(1)
		this.emails[0].envelope.to.must.eql(Config.notificationEmails)
	})

	it("must not send email if nothing changed", function*() {
		var uuid = "a8166697-7f68-43e4-a729-97a7868b4d51"

		var parliamentApiData = {
			uuid: "dcccf075-9da3-4224-96fb-8831e485a1be",
			senderReference: uuid,
			title: "Speech of freedom!",

			statuses: [{
				"date": "2018-10-24",
				"status": {"code": "REGISTREERITUD", "value": "Registreeritud"}
			}, {
				"date": "2018-11-13",
				"status": {"code": "MENETLUSSE_VOETUD", "value": "Menetlusse võetud"}
			}]
		}

		var initiative = yield initiativesDb.create({
			uuid: uuid,
			parliament_api_data: parliamentApiData
		})

		this.router.get("/api/documents/collective-addresses", respond.bind(null, [
			parliamentApiData
		]))

		yield job()
		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)
		initiatives.must.eql([initiative])
		this.emails.must.be.empty()
	})

	it("must send email if a status element was added", function*() {
		var uuid = "a8166697-7f68-43e4-a729-97a7868b4d51"

		var parliamentApiData = {
			uuid: "dcccf075-9da3-4224-96fb-8831e485a1be",
			senderReference: uuid,
			title: "Speech of freedom!",

			statuses: [{
				"date": "2018-10-24",
				"status": {"code": "REGISTREERITUD", "value": "Registreeritud"}
			}]
		}

		yield initiativesDb.create({
			uuid: uuid,
			parliament_api_data: parliamentApiData
		})

		parliamentApiData = O.clone({
			__proto__: parliamentApiData,

			status: parliamentApiData.statuses.concat({
				"date": "2018-11-13",
				"status": {"code": "MENETLUSSE_VOETUD", "value": "Menetlusse võetud"}
			})
		})

		this.router.get("/api/documents/collective-addresses", respond.bind(null, [
			parliamentApiData
		]))

		yield job()
		yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([
			new ValidDbInitiative({
				uuid: uuid,
				parliament_api_data: JSON.stringify(parliamentApiData)
			})
		])

		this.emails.length.must.equal(1)
		this.emails[0].envelope.to.must.eql(Config.notificationEmails)
	})

	it("must not create db initiative if CitizenOS says it doesn't exist",
		function*() {
		var uuid = "a8166697-7f68-43e4-a729-97a7868b4d51"

		var parliamentApiData = {
			uuid: "dcccf075-9da3-4224-96fb-8831e485a1be",
			senderReference: uuid,
			title: "Speech of freedom!"
		}

		this.router.get("/api/documents/collective-addresses", respond.bind(null, [
			parliamentApiData
		]))

		this.router.get(`/api/topics/${uuid}`, respondWith404)

		yield job()
		yield sqlite(sql`SELECT * FROM initiatives`).must.then.be.empty()
		this.emails.must.be.empty()
	})

	it("must ignore collective addresses without senderReference", function*() {
		this.router.get("/api/documents/collective-addresses", respond.bind(null, [{
			uuid: "dcccf075-9da3-4224-96fb-8831e485a1be",
			title: "Speech of freedom!"
		}]))

		yield job()
		yield sqlite(sql`SELECT * FROM initiatives`).must.then.be.empty()
		this.emails.must.be.empty()
	})
})

function respondWith404(_req, res) { res.statusCode = 404; res.end() }

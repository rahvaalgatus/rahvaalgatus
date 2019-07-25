var _ = require("root/lib/underscore")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidEvent = require("root/test/valid_db_initiative_event")
var ValidFile = require("root/test/valid_event_file")
var initiativesDb = require("root/db/initiatives_db")
var eventsDb = require("root/db/initiative_events_db")
var filesDb = require("root/db/initiative_files_db")
var respond = require("root/test/fixtures").respond
var newUuid = require("uuid/v4")
var job = require("root/cli/parliament_sync_cli")
var sql = require("sqlate")
var concat = Array.prototype.concat.bind(Array.prototype)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var respondWithEmpty = respond.bind(null, {})
var INITIATIVES_URL = "/api/documents/collective-addresses"
var INITIATIVE_UUID = "c5c91e62-124b-41a4-9f37-6f80f8cab5ab"
var DOCUMENT_UUID = "e519fd6f-584a-4f0e-9434-6d7c6dfe4865"
var VOLUME_UUID = "ca9c364f-25b2-4162-a9af-d4e6932d502f"
var FILE_UUID = "a8dd7913-0816-4e46-9b5a-c661a2eb97de"
var PARLIAMENT_URL = "https://www.riigikogu.ee"
var DOCUMENT_URL = PARLIAMENT_URL + "/tegevus/dokumendiregister/dokument"
var EXAMPLE_BUFFER = Buffer.from("\x0d\x25")

// Must.js doesn't support comparing buffers' contents out of the box, so let's
// fix Buffer to help with that.
Buffer.prototype.valueOf = Buffer.prototype.toJSON

describe("ParliamentSyncCli", function() {
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/time")()
	beforeEach(require("root/test/mitm").router)

	it("must request from parliament", function*() {
		this.router.get(INITIATIVES_URL, function(req, res) {
			req.headers.host.must.equal("api.riigikogu.ee")
			respond([], req, res)
		})

		yield job()
	})

	it("must create external initiative with files", function*() {
		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu paremaks tegemiseks",
			created: "2019-05-29T14:35:31.246",
			sender: "John Smith",
			responsibleCommittee: {name: "Sotsiaalkomisjon"}
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			files: [{
				uuid: FILE_UUID,
				fileName: "algatus.pdf",
				accessRestrictionType: "PUBLIC",
				created: "2019-02-06T13:53:36.678"
			}]
		}))

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
		)

		yield job()

		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([new ValidInitiative({
			uuid: INITIATIVE_UUID,
			external: true,
			created_at: new Date(2019, 4, 29, 14, 35, 31, 246),
			title: "elu paremaks tegemiseks",
			author_name: "John Smith",
			phase: "parliament",
			parliament_uuid: INITIATIVE_UUID,
			parliament_committee: "Sotsiaalkomisjon",
			parliament_api_data: initiatives[0].parliament_api_data,
			parliament_synced_at: new Date
		})])

		yield eventsDb.search(sql`
			SELECT * FROM initiative_events
		`).must.then.be.empty()

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.eql([new ValidFile({
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			external_id: FILE_UUID,
			external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
			name: "algatus.pdf",
			title: "Kollektiivne pöördumine elu paremaks tegemiseks",
			url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${INITIATIVE_UUID}`,
			content: Buffer.from("PDF"),
			content_type: "application/pdf",
		})])
	})

	it("must create external initiative in done phase if MENETLUS_LOPETATUD",
		function*() {
		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu paremaks tegemiseks",
			created: "2019-05-29T14:35:31.246",
			statuses: [{date: "2019-01-29", status: {code: "MENETLUS_LOPETATUD"}}]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		yield job()

		var initiative = yield initiativesDb.read(sql`SELECT * FROM initiatives`)

		initiative.must.eql(new ValidInitiative({
			uuid: INITIATIVE_UUID,
			external: true,
			created_at: new Date(2019, 4, 29, 14, 35, 31, 246),
			title: "elu paremaks tegemiseks",
			phase: "done",
			finished_in_parliament_at: new Date(2019, 0, 29),
			parliament_uuid: INITIATIVE_UUID,
			parliament_api_data: initiative.parliament_api_data,
			parliament_synced_at: new Date
		}))
	})

	it("must strip quotes from title on an external initiative", function*() {
		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine \"Teeme elu paremaks!\""
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		yield job()
		var initiative = yield initiativesDb.read(INITIATIVE_UUID)
		initiative.title.must.equal("Teeme elu paremaks!")
	})

	it("must update local initiative with files", function*() {
		var initiative = yield initiativesDb.create({
			uuid: newUuid(),
			phase: "government"
		})

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu paremaks tegemiseks",
			senderReference: initiative.uuid,
			responsibleCommittee: {name: "Sotsiaalkomisjon"},

			statuses: [
				{date: "2018-10-23", status: {code: "REGISTREERITUD"}},
				{date: "2018-10-24", status: {code: "MENETLUSSE_VOETUD"}},
				{date: "2018-10-25", status: {code: "MENETLUS_LOPETATUD"}}
			]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			files: [{
				uuid: FILE_UUID,
				fileName: "algatus.pdf",
				accessRestrictionType: "PUBLIC",
				created: "2019-02-06T13:53:36.678"
			}]
		}))

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
		)

		yield job()

		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([{
			// NOTE: Phase isn't updated for existing initiatives.
			__proto__: initiative,
			parliament_uuid: INITIATIVE_UUID,
			parliament_committee: "Sotsiaalkomisjon",
			parliament_api_data: initiatives[0].parliament_api_data,
			parliament_synced_at: new Date,
			received_by_parliament_at: new Date(2018, 9, 23),
			accepted_by_parliament_at: new Date(2018, 9, 24),
			finished_in_parliament_at: new Date(2018, 9, 25)
		}])

		yield eventsDb.search(sql`
			SELECT * FROM initiative_events
		`).must.then.have.length(3)

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.eql([new ValidFile({
			id: 1,
			initiative_uuid: initiative.uuid,
			external_id: FILE_UUID,
			external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
			name: "algatus.pdf",
			title: "Kollektiivne pöördumine elu paremaks tegemiseks",
			url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${INITIATIVE_UUID}`,
			content: Buffer.from("PDF"),
			content_type: "application/pdf",
		})])
	})

	it("must not download non-public files", function*() {
		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			files: [{
				uuid: FILE_UUID,
				fileName: "Pöördumise allkirjade register _30_10_2018.xlsx",
				accessRestrictionType: "FOR_USE_WITHIN_ESTABLISHMENT",
			}]
		}))

		yield job()

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.be.empty()
	})

	it("must update external initiative", function*() {
		var initiative = yield initiativesDb.create({
			uuid: INITIATIVE_UUID,
			parliament_uuid: INITIATIVE_UUID,
			external: true,

			// NOTE: Ensure phase of an existing external initiative isn't updated as
			// it is set on the initial import.
			phase: "government"
		})

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu paremaks tegemiseks",
			sender: "John Smith",

			statuses: [
				{date: "2018-10-23", status: {code: "REGISTREERITUD"}},
				{date: "2018-10-24", status: {code: "MENETLUSSE_VOETUD"}},
				{date: "2018-10-25", status: {code: "MENETLUS_LOPETATUD"}}
			]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)
		yield job()

		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([{
			__proto__: initiative,
			parliament_uuid: INITIATIVE_UUID,
			parliament_api_data: initiatives[0].parliament_api_data,
			parliament_synced_at: new Date,
			received_by_parliament_at: new Date(2018, 9, 23),
			accepted_by_parliament_at: new Date(2018, 9, 24),
			finished_in_parliament_at: new Date(2018, 9, 25)
		}])
	})

	it("must ignore if API response not updated", function*() {
		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)
		yield job()
		var initiative = yield initiativesDb.read(sql`SELECT * FROM initiatives`)
		var syncedAt = initiative.parliament_synced_at
		this.time.tick(60 * 1000)

		yield job()
		initiative = yield initiativesDb.read(initiative)
		initiative.parliament_synced_at.must.eql(syncedAt)
	})

	// It seems to be the case as of Jul 19, 2019 that the statuses array is
	// sorted randomly on every response. Same for relatedDocuments and
	// relatedVolumes.
	it("must ignore if API response shuffles arrays", function*() {
		var documents = [{uuid: newUuid()}, {uuid: newUuid()}, {uuid: newUuid()}]
		var volumes = [{uuid: newUuid()}, {uuid: newUuid()}, {uuid: newUuid()}]

		var parliamentResponse = {
			uuid: INITIATIVE_UUID,
			relatedDocuments: documents,
			relatedVolumes: volumes,

			statuses: [
				// Note the test with two statuses on the same date, too.
				{date: "2018-10-24", status: {code: "REGISTREERITUD"}},
				{date: "2018-10-24", status: {code: "MENETLUSSE_VOETUD"}},
				{date: "2018-10-25", status: {code: "MENETLUS_LOPETATUD"}}
			]
		}

		var requests = 0
		this.router.get(INITIATIVES_URL, function(req, res) {
			if (requests++ == 0) respond([parliamentResponse], req, res)
			else respond([_.assign({}, parliamentResponse, {
				statuses: _.shuffle(parliamentResponse.statuses),
				relatedDocuments: _.shuffle(parliamentResponse.relatedDocuments),
				relatedVolumes: _.shuffle(parliamentResponse.relatedVolumes)
			})], req, res)
		})

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		documents.forEach((doc) => (
			this.router.get(`/api/documents/${doc.uuid}`, respond.bind(null, doc))
		))

		volumes.forEach((volume) => (
			this.router.get(`/api/volumes/${volume.uuid}`, respond.bind(null, volume))
		))

		yield job()
		var initiative = yield initiativesDb.read(sql`SELECT * FROM initiatives`)
		var syncedAt = initiative.parliament_synced_at
		this.time.tick(1000)

		yield job()
		initiative = yield initiativesDb.read(initiative)
		initiative.parliament_synced_at.must.eql(syncedAt)
	})

	_.each({
		"REGISTREERITUD status": [{
			statuses: [{date: "2018-10-24", status: {code: "REGISTREERITUD"}}]
		}, {
			received_by_parliament_at: new Date(2018, 9, 24)
		}, {
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "REGISTREERITUD",
			type: "parliament-received",
			title: null,
			content: null
		}],

		"MENETLUSSE_VOETUD status": [{
			statuses: [{date: "2018-10-24", status: {code: "MENETLUSSE_VOETUD"}}]
		}, {
			accepted_by_parliament_at: new Date(2018, 9, 24)
		}, {
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "MENETLUSSE_VOETUD",
			type: "parliament-accepted",
			title: null,
			content: null,
		}],

		"ARUTELU_KOMISJONIS status": [{
			responsibleCommittee: {name: "Sotsiaalkomisjon"},
			statuses: [{date: "2018-10-24", status: {code: "ARUTELU_KOMISJONIS"}}]
		}, {
			parliament_committee: "Sotsiaalkomisjon"
		}, {
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/2018-10-24",
			type: "parliament-committee-meeting",
			title: null,
			content: {committee: "Sotsiaalkomisjon"}
		}],

		"ARUTELU_KOMISJONIS status with JATKATA_ARUTELU decision": [{
			statuses: [{
				date: "2018-10-24",
				status: {code: "ARUTELU_KOMISJONIS"},
				committeeDecision: {code: "JATKATA_ARUTELU"}
			}]
		}, null, {
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/2018-10-24",
			type: "parliament-committee-meeting",
			title: null,
			content: {committee: null, decision: "continue"},
		}],

		"ARUTELU_KOMISJONIS status with LAHENDADA_MUUL_VIISIL decision": [{
			statuses: [{
				date: "2018-10-24",
				status: {code: "ARUTELU_KOMISJONIS"},
				committeeDecision: {code: "LAHENDADA_MUUL_VIISIL"}
			}]
		}, {
			parliament_decision: "solve-differently",
		}, {
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/2018-10-24",
			type: "parliament-committee-meeting",
			title: null,
			content: {committee: null, decision: "solve-differently"}
		}],

		"ARUTELU_KOMISJONIS status with ETTEPANEK_TAGASI_LYKATA decision": [{
			statuses: [{
				date: "2018-10-24",
				status: {code: "ARUTELU_KOMISJONIS"},
				committeeDecision: {code: "ETTEPANEK_TAGASI_LYKATA"}
			}]
		}, {
			parliament_decision: "reject",
		}, {
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/2018-10-24",
			type: "parliament-committee-meeting",
			title: null,
			content: {committee: null, decision: "reject"}
		}],

		"ARUTELU_KOMISJONIS status with ETTEPANEK_INSTITUTSIOONILE decision": [{
			statuses: [{
				date: "2018-10-24",
				status: {code: "ARUTELU_KOMISJONIS"},
				committeeDecision: {code: "ETTEPANEK_INSTITUTSIOONILE"}
			}]
		}, {
			parliament_decision: "forward",
		}, {
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/2018-10-24",
			type: "parliament-committee-meeting",
			title: null,
			content: {committee: null, decision: "forward"}
		}],

		"MENETLUS_LOPETATUD status": [{
			statuses: [{date: "2018-10-24", status: {code: "MENETLUS_LOPETATUD"}}]
		}, {
			finished_in_parliament_at: new Date(2018, 9, 24)
		}, {
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "MENETLUS_LOPETATUD",
			type: "parliament-finished",
			title: null,
			content: null
		}],

		"TAGASI_LYKATUD status": [{
			statuses: [{date: "2018-10-24", status: {code: "TAGASI_LYKATUD"}}]
		}, {
			finished_in_parliament_at: new Date(2018, 9, 24),
			parliament_decision: "reject"
		}, {
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "MENETLUS_LOPETATUD",
			type: "parliament-finished",
			title: null,
			content: null
		}],

		"TAGASI_LYKATUD and MENETLUS_LOPETATUD status": [{
			statuses: [
				{date: "2018-10-24", status: {code: "TAGASI_LYKATUD"}},
				{date: "2018-10-26", status: {code: "MENETLUS_LOPETATUD"}}
			]
		}, {
			finished_in_parliament_at: new Date(2018, 9, 26),
			parliament_decision: "reject",
		}, {
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "MENETLUS_LOPETATUD",
			type: "parliament-finished",
			title: null,
			content: null
		}],

		// Tests sorting.
		"TAGASI_LYKATUD and MENETLUS_LOPETATUD status sorted in reverse": [{
			statuses: [
				{date: "2018-10-26", status: {code: "MENETLUS_LOPETATUD"}},
				{date: "2018-10-24", status: {code: "TAGASI_LYKATUD"}}
			]
		}, {
			finished_in_parliament_at: new Date(2018, 9, 26),
			parliament_decision: "reject",
		}, {
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "MENETLUS_LOPETATUD",
			type: "parliament-finished",
			title: null,
			content: null
		}],

		"MENETLUS_LOPETATUD status and LAHENDADA_MUUL_VIISIL decision": [{
			statuses: [{
				date: "2018-10-24",
				status: {code: "ARUTELU_KOMISJONIS"},
				committeeDecision: {code: "LAHENDADA_MUUL_VIISIL"}
			}, {
				date: "2018-10-26", status: {code: "MENETLUS_LOPETATUD"}
			}]
		}, {
			finished_in_parliament_at: new Date(2018, 9, 26),
			parliament_decision: "solve-differently",
		}, [{
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/2018-10-24",
			type: "parliament-committee-meeting",
			title: null,
			content: {committee: null, decision: "solve-differently"}
		}, {
			occurred_at: new Date(2018, 9, 26),
			origin: "parliament",
			external_id: "MENETLUS_LOPETATUD",
			type: "parliament-finished",
			title: null,
			content: null
		}]],

		"MENETLUS_LOPETATUD status and ETTEPANEK_TAGASI_LYKATA decision": [{
			statuses: [{
				date: "2018-10-24",
				status: {code: "ARUTELU_KOMISJONIS"},
				committeeDecision: {code: "ETTEPANEK_TAGASI_LYKATA"}
			}, {
				date: "2018-10-26", status: {code: "MENETLUS_LOPETATUD"}
			}]
		}, {
			finished_in_parliament_at: new Date(2018, 9, 26),
			parliament_decision: "reject",
		}, [{
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/2018-10-24",
			type: "parliament-committee-meeting",
			title: null,
			content: {committee: null, decision: "reject"}
		}, {
			occurred_at: new Date(2018, 9, 26),
			origin: "parliament",
			external_id: "MENETLUS_LOPETATUD",
			type: "parliament-finished",
			title: null,
			content: null
		}]],

		"MENETLUS_LOPETATUD status and ETTEPANEK_INSTITUTSIOONILE decision": [{
			statuses: [{
				date: "2018-10-24",
				status: {code: "ARUTELU_KOMISJONIS"},
				committeeDecision: {code: "ETTEPANEK_INSTITUTSIOONILE"}
			}, {
				date: "2018-10-26", status: {code: "MENETLUS_LOPETATUD"}
			}]
		}, {
			finished_in_parliament_at: new Date(2018, 9, 26),
			parliament_decision: "forward",
		}, [{
			occurred_at: new Date(2018, 9, 24),
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/2018-10-24",
			type: "parliament-committee-meeting",
			title: null,
			content: {committee: null, decision: "forward"}
		}, {
			occurred_at: new Date(2018, 9, 26),
			origin: "parliament",
			external_id: "MENETLUS_LOPETATUD",
			type: "parliament-finished",
			title: null,
			content: null
		}]]
	}, function(test, title) {
		var api = test[0]
		var attrs = test[1]
		var eventAttrs = test[2]

		it(`must create events given ${title}`, function*() {
			var initiative = yield initiativesDb.create({
				uuid: INITIATIVE_UUID,
				parliament_uuid: INITIATIVE_UUID
			})
				
			this.router.get(INITIATIVES_URL,	respond.bind(null, [
				_.defaults({uuid: INITIATIVE_UUID}, api)
			]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)
			yield job()

			var updated = yield initiativesDb.read(initiative)

			updated.must.eql(_.assign({
				__proto__: initiative,
				parliament_synced_at: new Date,
				parliament_api_data: updated.parliament_api_data,
			}, attrs))

			var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)
			events.must.eql(concat(eventAttrs).map((attrs, i) => new ValidEvent({
				__proto__: attrs,
				id: i + 1,
				initiative_uuid: initiative.uuid
			})))
		})
	})

	it("must update committee meeting event", function*() {
		var requested = 0
		this.router.get(INITIATIVES_URL, function(req, res) {
			if (requested++ == 0) respond([{
				uuid: INITIATIVE_UUID,
				responsibleCommittee: {name: "Sotsiaalkomisjon"},
				statuses: [{
					date: "2018-10-24",
					status: {code: "ARUTELU_KOMISJONIS"},
					committeeDecision: {code: "JATKATA_ARUTELU"}
				}]
			}], req, res)
			else respond([{
				uuid: INITIATIVE_UUID,
				responsibleCommittee: {name: "Majanduskomisjon"},
				statuses: [{
					date: "2018-10-24",
					status: {code: "ARUTELU_KOMISJONIS"},
					committeeDecision: {code: "ETTEPANEK_INSTITUTSIOONILE"}
				}]
			}], req, res)
		})

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)
		yield job()

		var event = yield eventsDb.read(sql`SELECT * FROM initiative_events`)

		event = yield eventsDb.update(event, {
			type: event.type,
			content: _.assign(event.content, {summary: "It was a good meeting."})
		})

		yield job()

		yield eventsDb.read(event).must.then.eql({
			__proto__: event,
			content: {
				committee: "Sotsiaalkomisjon",
				decision: "forward",
				summary: "It was a good meeting."
			}
		})
	})

	it("must update decision", function*() {
		var requestedInitiatives = 0
		this.router.get(INITIATIVES_URL, function(req, res) {
			if (requestedInitiatives++ == 0) respond([{
				uuid: INITIATIVE_UUID,
				// Use an updated title as a way to force refetching of related
				// documents.
				relatedDocuments: [{
					uuid: DOCUMENT_UUID,
					documentType: "decisionDocument",
					title: "A"
				}]
			}], req, res)
			else respond([{
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{
					uuid: DOCUMENT_UUID,
					documentType: "decisionDocument",
					title: "B"
				}]
			}], req, res)
		})

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		var requestedDocuments = 0
		this.router.get(`/api/documents/${DOCUMENT_UUID}`, function(req, res) {
			if (requestedDocuments++ == 0) respond({
				uuid: DOCUMENT_UUID,
				title: "Otsuse muutmine",
				documentType: "decisionDocument",
				created: "2015-06-18T13:37:42.666"
			}, req, res)
			else respond({
				uuid: DOCUMENT_UUID,
				title: "Otsuse muutmine (uuendatud)",
				documentType: "decisionDocument",
				created: "2015-06-18T15:37:42.666"
			}, req, res)
		})

		yield job()

		var event = yield eventsDb.read(sql`SELECT * FROM initiative_events`)

		event = yield eventsDb.update(event, {
			type: event.type,
			content: _.assign(event.content, {summary: "An important decision"})
		})

		yield job()

		yield eventsDb.read(event).must.then.eql({
			__proto__: event,
			occurred_at: new Date(2015, 5, 18, 15, 37, 42, 666),
			updated_at: new Date,
			content: {summary: "An important decision"}
		})
	})

	// While supposedly a data error and fixed in the parliament APi response as
	// of Jul 12, 2019, keep the test around to ensure proper handling of future
	// duplicates.
	//
	// https://github.com/riigikogu-kantselei/api/issues/17
	it("must ignore duplicate REGISTREERITUD statuses", function*() {
		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,

			statuses: [
				{date: "2018-10-24", status: {code: "REGISTREERITUD"}},
				{date: "2018-10-24", status: {code: "REGISTREERITUD"}}
			]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)
		yield job()

		var initiative = yield initiativesDb.read(sql`SELECT * FROM initiatives`)

		initiative.must.eql(new ValidInitiative({
			__proto__: initiative,
			uuid: INITIATIVE_UUID,
			received_by_parliament_at: new Date(2018, 9, 24),
			parliament_uuid: INITIATIVE_UUID,
			parliament_api_data: initiative.parliament_api_data,
			parliament_synced_at: new Date
		}))

		var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)
		events.length.must.equal(1)
	})

	it("must not create events if no statuses but related document present",
		function*() {
		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			relatedDocuments: [{uuid: DOCUMENT_UUID}]
		}]))

		this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
			uuid: DOCUMENT_UUID,
			title: "Kollektiivse pöördumise menetlusse võtmine",
			documentType: "decisionDocument"
		}))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)
		yield job()

		yield eventsDb.search(sql`
			SELECT * FROM initiative_events
		`).must.then.be.empty()

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.be.empty()
	})

	describe("given related documents", function() {
		it("must not download non-public files", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				statuses: [{date: "2018-10-24", status: {code: "MENETLUSSE_VOETUD"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Kollektiivse pöördumise menetlusse võtmine",
				documentType: "decisionDocument",

				files: [{
					uuid: FILE_UUID,
					fileName: "Pöördumise allkirjade register _30_10_2018.xlsx",
					accessRestrictionType: "FOR_USE_WITHIN_ESTABLISHMENT",
				}]
			}))

			yield job()

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.be.empty()
		})

		_.each({
			"MENETLUSSE_VOETUD and meeting protocol": [{
				statuses: [{date: "2019-01-29", status: {code: "MENETLUSSE_VOETUD"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "29.01.2019 juhatuse istungi protokoll",
					documentType: "protokoll",

					files: [{
						uuid: FILE_UUID,
						fileName: "29.01.19_5T.pdf",
						accessRestrictionType: "PUBLIC",
						created: "2019-01-30T15:45:08.621"
					}]
				}
			}, [{
				id: 1,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: FILE_UUID,
				name: "29.01.19_5T.pdf",
				title: "29.01.2019 juhatuse istungi protokoll",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: "application/octet-stream"
			}]],

			"MENETLUSSE_VOETUD and meeting protocol with no leading zeroes": [{
				statuses: [{date: "2019-01-01", status: {code: "MENETLUSSE_VOETUD"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "1.1.2019 juhatuse istungi protokoll",
					documentType: "protokoll",

					files: [{
						uuid: FILE_UUID,
						fileName: "Protokoll.pdf",
						accessRestrictionType: "PUBLIC",
						created: "2019-01-30T15:45:08.621"
					}]
				}
			}, [{
				id: 1,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: FILE_UUID,
				name: "Protokoll.pdf",
				title: "1.1.2019 juhatuse istungi protokoll",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: "application/octet-stream"
			}]],

			"MENETLUS_LOPETATUD and decision": [{
				statuses: [{date: "2018-10-24", status: {code: "MENETLUSSE_VOETUD"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Kollektiivse pöördumise menetlusse võtmine",
					documentType: "decisionDocument",

					files: [{
						uuid: FILE_UUID,
						fileName: "4-1-70_-_Kollektiivse_pöördumise_menetlusse_võtmine.asice",
						accessRestrictionType: "PUBLIC",
						created: "2019-06-19T15:11:52.465"
					}, {
						uuid: "e80ae43f-4e3d-484f-84c6-aa50b37d9c3c",
						fileName: "70_17.06.2019_pöördumine.pdf",
						accessRestrictionType: "PUBLIC",
						created: "2019-06-17T12:47:30.594"
					}]
				}
			}, [{
				id: 1,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: FILE_UUID,
				name: "4-1-70_-_Kollektiivse_pöördumise_menetlusse_võtmine.asice",
				title: "Kollektiivse pöördumise menetlusse võtmine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: "application/octet-stream"
			}, {
				id: 2,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: "e80ae43f-4e3d-484f-84c6-aa50b37d9c3c",
				name: "70_17.06.2019_pöördumine.pdf",
				title: "Kollektiivse pöördumise menetlusse võtmine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: "application/octet-stream"
			}]],

			"MENETLUS_LOPETATUD and response": [{
				statuses: [{date: "2019-01-29", status: {code: "MENETLUS_LOPETATUD"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "ÕIGK vastuskiri - Kollektiivne pöördumine X",
					documentType: "letterDocument",
					direction: {code: "VALJA"},

					files: [{
						uuid: "811eac10-a47e-468f-bec9-56c790157f08",
						fileName: "ÕIGK_11062019.pdf",
						accessRestrictionType: "PUBLIC",
						created: "2019-06-11T11:14:50.531"
					}]
				}
			}, [{
				id: 1,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: "811eac10-a47e-468f-bec9-56c790157f08",
				name: "ÕIGK_11062019.pdf",
				title: "ÕIGK vastuskiri - Kollektiivne pöördumine X",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: "application/octet-stream"
			}]],

			"MENETLUS_LOPETATUD and response with \"vastuskiri\" at the end": [{
				statuses: [{date: "2019-01-29", status: {code: "MENETLUS_LOPETATUD"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Kollektiivne pöördumine X - ÕISK vastuskiri reformimiseks",
					documentType: "letterDocument",
					direction: {code: "VALJA"},

					files: [{
						uuid: "811eac10-a47e-468f-bec9-56c790157f08",
						fileName: "ÕIGK_11062019.pdf",
						accessRestrictionType: "PUBLIC",
						created: "2019-06-11T11:14:50.531"
					}]
				}
			}, [{
				id: 1,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: "811eac10-a47e-468f-bec9-56c790157f08",
				name: "ÕIGK_11062019.pdf",
				title: "Kollektiivne pöördumine X - ÕISK vastuskiri reformimiseks",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: "application/octet-stream"
			}]],

			"MENETLUS_LOPETATUD and response with \"vastuskiri\" capitalized": [{
				statuses: [{date: "2019-01-29", status: {code: "MENETLUS_LOPETATUD"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Vastuskiri - Kollektiivne pöördumine X",
					documentType: "letterDocument",
					direction: {code: "VALJA"},

					files: [{
						uuid: "811eac10-a47e-468f-bec9-56c790157f08",
						fileName: "ÕIGK_11062019.pdf",
						accessRestrictionType: "PUBLIC",
						created: "2019-06-11T11:14:50.531"
					}]
				}
			}, [{
				id: 1,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: "811eac10-a47e-468f-bec9-56c790157f08",
				name: "ÕIGK_11062019.pdf",
				title: "Vastuskiri - Kollektiivne pöördumine X",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: "application/octet-stream"
			}]],

			"ARUTELU_KOMISJONIS and meeting protocol": [{
				statuses: [{date: "2019-06-04", status: {code: "ARUTELU_KOMISJONIS"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "RAHK protokoll 04.06.2019",
					documentType: "protokoll",

					files: [{
						uuid: FILE_UUID,
						fileName: "RAHK protokoll 9_04 06 2019.pdf",
						accessRestrictionType: "PUBLIC",
						created: "2019-06-11T11:14:50.531"
					}]
				}
			}, [{
				id: 1,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: FILE_UUID,
				name: "RAHK protokoll 9_04 06 2019.pdf",
				title: "RAHK protokoll 04.06.2019",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: "application/octet-stream"
			}]],

			"ARUTELU_KOMISJONIS and meeting protocol with date only in volume": [{
				statuses: [{date: "2018-01-16", status: {code: "ARUTELU_KOMISJONIS"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Protokoll",
					documentType: "protokoll",

					volume: {
						uuid: VOLUME_UUID,
						title: "Komisjoni istung teisipäev, 16.01.2018 14:00",
						volumeType: "unitSittingVolume",
					},

					files: [{
						uuid: FILE_UUID,
						fileName: "Protokoll.pdf",
						accessRestrictionType: "PUBLIC",
						created: "2018-03-08T15:41:14.26"
					}]
				}
			}, [{
				id: 1,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: FILE_UUID,
				name: "Protokoll.pdf",
				title: "Protokoll",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: "application/octet-stream"
			}]]
		}, function(test, title) {
			var api = test[0]
			var documents = test[1]
			var files = test[2]

			it(`must create files given ${title}`,
				function*() {
				this.router.get(INITIATIVES_URL, respond.bind(null, [
					_.defaults({uuid: INITIATIVE_UUID}, api)
				]))

				this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

				_.each(documents, (document, uuid) => (
					this.router.get(`/api/documents/${uuid}`,
						respond.bind(null, document)
					)
				))

				flatten(_.map(documents, (doc) => doc.files)).map((file) => (
					this.router.get(`/download/${file.uuid}`,
						respondWithRiigikoguDownload.bind(null,
							"application/octet-stream",
							"\x0d\x25"
						)
					)
				))

				yield job()

				yield filesDb.search(sql`
					SELECT * FROM initiative_files
				`).must.then.eql(files.map((file) => new ValidFile({
					__proto__: file,
					external_url: PARLIAMENT_URL + "/download/" + file.external_id
				})))
			})
		})

		it("must use related document file title if available", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				statuses: [{date: "2019-01-29", status: {code: "MENETLUS_LOPETATUD"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "ÕIGK vastuskiri - Kollektiivne pöördumine X",
				documentType: "letterDocument",
				direction: {code: "VALJA"},

				files: [{
					uuid: FILE_UUID,
          fileName: "vastuskiri.pdf",
          fileTitle: "Vastuskiri",
					accessRestrictionType: "PUBLIC",
					created: "2018-03-08T15:41:14.26"
				}]
			}))

			this.router.get(`/download/${FILE_UUID}`,
				respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
			)

			yield job()

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.eql([new ValidFile({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				event_id: 1,
				external_id: FILE_UUID,
				external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
				name: "vastuskiri.pdf",
				title: "Vastuskiri",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: "application/pdf"
			})])
		})

		it("must create event given a document representing an agenda item",
			function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				responsibleCommittee: {name: "Sotsiaalkomisjon"},
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Kollektiivne pöördumine haruapteekide säilitamise osas",
				documentType: "unitAgendaItemDocument",
				invitees: "Sotsiaalministeeriumi terviseala asekantsler",

				volume: {
					uuid: VOLUME_UUID,
					title: "Komisjoni istung teisipäev, 29.01.2019 kell 14.00",
					volumeType: "unitSittingVolume"
				}
			}))

			var minutesUuid = newUuid()

			this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
				uuid: VOLUME_UUID,
				title: "Komisjoni istung teisipäev, 29.01.2019 kell 14.00",
				volumeType: "unitSittingVolume",

				documents: [{
					uuid: DOCUMENT_UUID,
					title: "Kollektiivne pöördumine haruapteekide säilitamise osas",
					documentType: "unitAgendaItemDocument",
				}, {
					// Include another unitAgendaItemDocument to ensure it doesn't get
					// fetched.
					uuid: newUuid(),
					title: "Muud küsimused",
					documentType: "unitAgendaItemDocument",
				}, {
					uuid: minutesUuid,
					title: "SOTK protokoll 29.01.2019",
					documentType: "protokoll"
				}]
			}))

			this.router.get(`/api/documents/${minutesUuid}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "SOTK protokoll 29.01.2019",
				documentType: "protokoll",

				files: [{
					uuid: FILE_UUID,
					fileName: "Protokoll.pdf",
					accessRestrictionType: "PUBLIC",
					created: "2019-02-06T13:53:36.678"
				}]
			}))

			this.router.get(`/download/${FILE_UUID}`,
				respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
			)

			yield job()

			var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)

			events.must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				occurred_at: new Date(2019, 0, 29),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2019-01-29",
				type: "parliament-committee-meeting",
				title: null,

				content: {
					committee: "Sotsiaalkomisjon",
					invitees: "Sotsiaalministeeriumi terviseala asekantsler"
				}
			})])

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.eql([new ValidFile({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				event_id: 1,
				external_id: FILE_UUID,
				external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
				name: "Protokoll.pdf",
				title: "SOTK protokoll 29.01.2019",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: "application/pdf"
			})])
		})

		it("must create event given a decision document", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Otsuse muutmine",
				documentType: "decisionDocument",
				created: "2015-06-18T13:37:42.666",

				files: [{
					uuid: FILE_UUID,
					fileName: "protokoll.pdf",
					accessRestrictionType: "PUBLIC",
					created: "2019-01-30T15:45:08.621",
				}]
			}))

			this.router.get(`/download/${FILE_UUID}`,
				respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
			)

			yield job()

			var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)

			events.must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-decision",
				title: null,
				content: {}
			})])

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.eql([new ValidFile({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				event_id: 1,
				external_id: FILE_UUID,
				external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
				name: "protokoll.pdf",
				title: "Otsuse muutmine",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: "application/pdf"
			})])
		})

		it("must create event given a volume of a meeting", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,

				relatedVolumes: [{
					uuid: VOLUME_UUID,
					title: "Komisjoni istung esmaspäev, 18.02.2019 11:15",
					volumeType: "unitSittingVolume"
				}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
				uuid: VOLUME_UUID,
				title: "Komisjoni istung esmaspäev, 18.02.2019 11:15",
				volumeType: "unitSittingVolume",

				documents: [{
					// Include a unitAgendaItemDocument to ensure it doesn't get fetched.
					uuid: newUuid(),
					title: "Muud küsimused",
					documentType: "unitAgendaItemDocument",
				}, {
					uuid: DOCUMENT_UUID,
					title: "Protokoll",
					documentType: "protokoll"
				}]
			}))

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Protokoll",
				documentType: "protokoll",

				files: [{
					uuid: FILE_UUID,
					fileName: "protokoll.pdf",
					accessRestrictionType: "PUBLIC",
					created: "2019-01-30T15:45:08.621",
				}]
			}))

			this.router.get(`/download/${FILE_UUID}`,
				respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
			)

			yield job()

			var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)

			events.must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				occurred_at: new Date(2019, 1, 18),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2019-02-18",
				type: "parliament-committee-meeting",
				title: null,
				content: {committee: null}
			})])

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.eql([new ValidFile({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				event_id: 1,
				external_id: FILE_UUID,
				external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
				name: "protokoll.pdf",
				title: "Protokoll",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: "application/pdf"
			})])
		})

		// Initiative https://api.riigikogu.ee/api/documents/collective-addresses/df08453e-a27f-48db-a095-6003142a999f
		// is an example where two "relatedVolumes" refer to meetings that, while
		// fortunately included in the "statuses" array, are not referred to in
		// "relatedDocuments".
		it("must create files given a volume of a meeting", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,

				statuses: [
					{date: "2019-02-18", status: {code: "ARUTELU_KOMISJONIS"}}
				],

				relatedVolumes: [{
					uuid: VOLUME_UUID,
					title: "Komisjoni istung esmaspäev, 18.02.2019 11:15",
					volumeType: "unitSittingVolume"
				}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
				uuid: VOLUME_UUID,
				title: "Komisjoni istung esmaspäev, 18.02.2019 11:15",
				volumeType: "unitSittingVolume",

				documents: [{
					// Include a unitAgendaItemDocument to ensure it doesn't get fetched.
					uuid: newUuid(),
					title: "Muud küsimused",
					documentType: "unitAgendaItemDocument",
				}, {
					uuid: DOCUMENT_UUID,
					title: "Protokoll",
					documentType: "protokoll"
				}]
			}))

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Protokoll",
				documentType: "protokoll",

				files: [{
					uuid: FILE_UUID,
					fileName: "protokoll.pdf",
					accessRestrictionType: "PUBLIC",
					created: "2019-01-30T15:45:08.621",
				}]
			}))

			this.router.get(`/download/${FILE_UUID}`,
				respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
			)

			yield job()

			var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)

			events.must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				occurred_at: new Date(2019, 1, 18),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2019-02-18",
				type: "parliament-committee-meeting",
				title: null,
				content: {committee: null}
			})])

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.eql([new ValidFile({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				event_id: 1,
				external_id: FILE_UUID,
				external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
				name: "protokoll.pdf",
				title: "Protokoll",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: "application/pdf"
			})])
		})
	})
})

function respondWithRiigikoguDownload(contentType, content, req, res) {
	// https://riigikogu.ee redirects to https://www.riigikogu.ee.
	req.headers.host.must.equal("www.riigikogu.ee")
	res.setHeader("Content-Type", contentType)
	res.end(content)
}

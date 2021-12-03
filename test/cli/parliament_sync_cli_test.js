var _ = require("root/lib/underscore")
var Config = require("root/config")
var DateFns = require("date-fns")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidEvent = require("root/test/valid_initiative_event")
var ValidFile = require("root/test/valid_event_file")
var ValidSubscription = require("root/test/valid_subscription")
var MediaType = require("medium-type")
var FetchError = require("fetch-error")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var filesDb = require("root/db/initiative_files_db")
var respond = require("root/test/fixtures").respond
var newUuid = _.compose(_.serializeUuid, _.uuidV4)
var formatDate = require("root/lib/i18n").formatDate
var job = require("root/cli/parliament_sync_cli")
var sql = require("sqlate")
var concat = Array.prototype.concat.bind(Array.prototype)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var respondWithEmpty = respond.bind(null, {})
var {respondWithNotFound} = require("./parliament_api")
var outdent = require("root/lib/outdent")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var INITIATIVES_URL = "/api/documents/collective-addresses"
var INITIATIVE_UUID = "c5c91e62-124b-41a4-9f37-6f80f8cab5ab"
var DOCUMENT_UUID = "e519fd6f-584a-4f0e-9434-6d7c6dfe4865"
var VOLUME_UUID = "ca9c364f-25b2-4162-a9af-d4e6932d502f"
var FILE_UUID = "a8dd7913-0816-4e46-9b5a-c661a2eb97de"
var PARLIAMENT_URL = "https://www.riigikogu.ee"
var DOCUMENT_URL = PARLIAMENT_URL + "/tegevus/dokumendiregister/dokument"
var EXAMPLE_BUFFER = Buffer.from("\x0d\x25")

describe("ParliamentSyncCli", function() {
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/email")()
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
			created: "2015-06-18T13:37:42.666",
			submittingDate: "2015-06-17",
			sender: "John Smith",
			responsibleCommittee: [{name: "Sotsiaalkomisjon"}]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			files: [{
				uuid: FILE_UUID,
				fileName: "algatus.pdf",
				accessRestrictionType: "PUBLIC"
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
			created_at: new Date(2015, 5, 17),
			published_at: new Date(2015, 5, 17),
			title: "Elu paremaks tegemiseks",
			author_name: "John Smith",
			phase: "parliament",
			undersignable: false,
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
			content_type: new MediaType("application/pdf")
		})])
	})

	it("must create external initiative in parliament phase if finished",
		function*() {
		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			submittingDate: "2015-06-18",
			statuses: [{date: "2015-06-20", status: {code: "MENETLUS_LOPETATUD"}}]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		yield job()

		var initiative = yield initiativesDb.read(sql`SELECT * FROM initiatives`)

		initiative.must.eql(new ValidInitiative({
			uuid: INITIATIVE_UUID,
			external: true,
			created_at: new Date(2015, 5, 18),
			published_at: new Date(2015, 5, 18),
			title: "Elu Tallinnas paremaks tegemiseks",
			phase: "done",
			undersignable: false,
			finished_in_parliament_at: new Date(2015, 5, 20),
			parliament_uuid: INITIATIVE_UUID,
			parliament_api_data: initiative.parliament_api_data,
			parliament_synced_at: new Date
		}))
	})

	it("must strip quotes from title on an external initiative", function*() {
		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine \"Teeme Tallinna paremaks!\""
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		yield job()
		var initiative = yield initiativesDb.read(INITIATIVE_UUID)
		initiative.title.must.equal("Teeme Tallinna paremaks!")
	})

	it("must strip dash from title on an external initiative", function*() {
		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine - Teeme Tallinna paremaks!"
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		yield job()
		var initiative = yield initiativesDb.read(INITIATIVE_UUID)
		initiative.title.must.equal("Teeme Tallinna paremaks!")
	})

	it("must update local initiative with events and files", function*() {
		var initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: (yield usersDb.create(new ValidUser)).id,
			author_name: "John Smith",
			phase: "government"
		}))

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			sender: "Mike Smith",
			senderReference: initiative.uuid,
			responsibleCommittee: [{name: "Sotsiaalkomisjon"}],

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
				accessRestrictionType: "PUBLIC"
			}]
		}))

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
		)

		yield job()

		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([{
			// NOTE: Phase isn't updated if initiative not in the parliament phase.
			// Neither is the author_name.
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
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${INITIATIVE_UUID}`,
			content: Buffer.from("PDF"),
			content_type: new MediaType("application/pdf")
		})])
	})

	it("must update local initiative if reference matches old parliament UUID",
		function*() {
		var initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: (yield usersDb.create(new ValidUser)).id,
			phase: "government",
			parliament_uuid: "83ecffc8-621a-4277-b388-39b1e626d1fa"
		}))

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			senderReference: initiative.parliament_uuid,
			responsibleCommittee: [{name: "Sotsiaalkomisjon"}]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {}))
		yield job()

		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([{
			// NOTE: The previous parliament UUID gets updated, too.
			__proto__: initiative,
			parliament_uuid: INITIATIVE_UUID,
			parliament_committee: "Sotsiaalkomisjon",
			parliament_api_data: initiatives[0].parliament_api_data,
			parliament_synced_at: new Date
		}])
	})

	it("must update local initiative phase to done if finished", function*() {
		var initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: (yield usersDb.create(new ValidUser)).id,
			phase: "parliament",
			parliament_uuid: INITIATIVE_UUID
		}))

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			senderReference: initiative.uuid,
			statuses: [{date: "2015-06-20", status: {code: "MENETLUS_LOPETATUD"}}]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {}))
		yield job()

		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([_.clone({
			__proto__: initiative,
			phase: "done",
			finished_in_parliament_at: new Date(2015, 5, 20),
			parliament_api_data: initiatives[0].parliament_api_data,
			parliament_synced_at: new Date
		})])
	})

	it("must not update local initiative phase to done if finished but not in parliament phase", function*() {
		var initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: (yield usersDb.create(new ValidUser)).id,
			phase: "government",
			parliament_uuid: INITIATIVE_UUID
		}))

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			senderReference: initiative.uuid,
			statuses: [{date: "2015-06-20", status: {code: "MENETLUS_LOPETATUD"}}]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {}))
		yield job()

		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([_.clone({
			__proto__: initiative,
			finished_in_parliament_at: new Date(2015, 5, 20),
			parliament_api_data: initiatives[0].parliament_api_data,
			parliament_synced_at: new Date
		})])
	})

	it("must update external initiative", function*() {
		var initiative = yield initiativesDb.create(new ValidInitiative({
			uuid: INITIATIVE_UUID,
			parliament_uuid: INITIATIVE_UUID,
			external: true,

			// NOTE: Ensure phase of an existing external initiative isn't updated as
			// it is set on the initial import.
			phase: "government",
			destination: "parliament"
		}))

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

	it("must email subscribers interested in events", function*() {
		var initiative = yield initiativesDb.create(new ValidInitiative({
			uuid: INITIATIVE_UUID,
			phase: "parliament",
			parliament_uuid: INITIATIVE_UUID,
			title: "Teeme elu paremaks!",
			external: true
		}))

		var subscriptions = yield subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date,
				event_interest: false
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date,
				event_interest: false
			}),

			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date,
				event_interest: true
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date,
				event_interest: true
			})
		])

		var eventDates = _.times(3, (i) => DateFns.addDays(new Date, i + -5))

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,

			statuses: [{
				date: formatDate("iso", eventDates[0]),
				status: {code: "REGISTREERITUD"}
			}, {
				date: formatDate("iso", eventDates[1]),
				status: {code: "MENETLUSSE_VOETUD"}
			}, {
				date: formatDate("iso", eventDates[2]),
				status: {code: "MENETLUS_LOPETATUD"}
			}]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		yield job()

		var messages = yield messagesDb.search(sql`
			SELECT * FROM initiative_messages
		`)

		var emails = subscriptions.slice(2).map((s) => s.email).sort()

		messages.must.eql([{
			id: messages[0].id,
			initiative_uuid: initiative.uuid,
			created_at: new Date,
			updated_at: new Date,
			origin: "event",

			title: t("INITIATIVE_PARLIAMENT_EVENT_MESSAGE_TITLE", {
				initiativeTitle: initiative.title,
				eventDate: formatDate("numeric", eventDates[2])
			}),

			text: renderEmail("INITIATIVE_PARLIAMENT_EVENT_MESSAGE_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				eventsUrl: `${Config.url}/initiatives/${initiative.uuid}#events`,
				unsubscribeUrl: "{{unsubscribeUrl}}",

				eventTitles: outdent`
					${formatDate("numeric", eventDates[0])} — ${t("PARLIAMENT_RECEIVED")}
					${formatDate("numeric", eventDates[1])} — ${t("PARLIAMENT_ACCEPTED")}
					${formatDate("numeric", eventDates[2])} — ${t("PARLIAMENT_FINISHED")}
				`
			}),

			sent_at: new Date,
			sent_to: emails
		}])

		this.emails.length.must.equal(1)
		this.emails[0].envelope.to.must.eql(emails)
		var msg = String(this.emails[0].message)
		msg.match(/^Subject: .*/m)[0].must.include("Teeme_elu_paremaks!")
		subscriptions.slice(2).forEach((s) => msg.must.include(s.update_token))
	})

	it("must not email subscribers if event occurred earlier than 3 months",
		function*() {
		var initiative = yield initiativesDb.create(new ValidInitiative({
			title: "Teeme elu paremaks!",
			uuid: INITIATIVE_UUID,
			phase: "parliament",
			parliament_uuid: INITIATIVE_UUID,
			external: true
		}))

		var subscription = yield subscriptionsDb.create(new ValidSubscription({
			initiative_uuid: null,
			confirmed_at: new Date,
			event_interest: true
		}))

		var threshold = DateFns.addMonths(new Date, -3)

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			statuses: [{
				date: formatDate("iso", DateFns.addDays(threshold, -1)),
				status: {code: "MENETLUSSE_VOETUD"}
			}, {
				date: formatDate("iso", threshold),
				status: {code: "MENETLUS_LOPETATUD"}
			}]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		yield job()

		var message = yield messagesDb.read(sql`SELECT * FROM initiative_messages`)

		message.must.eql({
			id: message.id,
			initiative_uuid: initiative.uuid,
			created_at: new Date,
			updated_at: new Date,
			origin: "event",

			title: t("INITIATIVE_PARLIAMENT_EVENT_MESSAGE_TITLE", {
				initiativeTitle: initiative.title,
				eventDate: formatDate("numeric", threshold)
			}),

			text: renderEmail("INITIATIVE_PARLIAMENT_EVENT_MESSAGE_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				eventsUrl: `${Config.url}/initiatives/${initiative.uuid}#events`,
				unsubscribeUrl: "{{unsubscribeUrl}}",

				eventTitles: outdent`
					${formatDate("numeric", threshold)} — ${t("PARLIAMENT_FINISHED")}
				`
			}),

			sent_at: new Date,
			sent_to: [subscription.email]
		})

		this.emails.length.must.equal(1)
	})

	it("must not email subscribers if no events created", function*() {
		var initiative = yield initiativesDb.create(new ValidInitiative({
			uuid: INITIATIVE_UUID,
			parliament_uuid: INITIATIVE_UUID,
			phase: "parliament",
			external: true
		}))

		yield eventsDb.create(new ValidEvent({
			initiative_uuid: initiative.uuid,
			external_id: "REGISTREERITUD",
			origin: "parliament",
			type: "parliament-received"
		}))

		yield subscriptionsDb.create(new ValidSubscription({
			confirmed_at: new Date,
			event_interest: true
		}))

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			statuses: [{date: "2018-10-23", status: {code: "REGISTREERITUD"}}]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		yield job()
		this.emails.length.must.equal(0)
	})

	it("must update the initiative given multiple committees", function*() {
		var initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: (yield usersDb.create(new ValidUser)).id,
			parliament_uuid: INITIATIVE_UUID,
			phase: "parliament"
		}))

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			responsibleCommittee: [
				{name: "Kultuurikomisjon"},
				{name: "Sotsiaalkomisjon", active: true},
				{name: "Majanduskomisjon"}
			]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		yield job()

		initiative = yield initiativesDb.read(initiative)
		initiative.parliament_committee.must.equal("Sotsiaalkomisjon")
	})

	it("must update the initiative given multiple committees with no active",
		function*() {
		var initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: (yield usersDb.create(new ValidUser)).id,
			parliament_uuid: INITIATIVE_UUID,
			phase: "parliament"
		}))

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			responsibleCommittee: [
				{name: "Kultuurikomisjon"},
				{name: "Sotsiaalkomisjon"},
				{name: "Majanduskomisjon"}
			]
		}]))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

		yield job()

		initiative = yield initiativesDb.read(initiative)
		initiative.parliament_committee.must.equal("Majanduskomisjon")
	})

	describe("given statuses", function() {
		_.each({
			"REGISTREERITUD status": [{
				// Ensures we don't use the initiative's "submittingDate" if we have
				// a status entry.
				submittingDate: "2015-06-17",
				statuses: [{date: "2015-06-18", status: {code: "REGISTREERITUD"}}]
			}, {
				received_by_parliament_at: new Date(2015, 5, 18)
			}, {
				occurred_at: new Date(2015, 5, 18),
				origin: "parliament",
				external_id: "REGISTREERITUD",
				type: "parliament-received",
				title: null,
				content:  null
			}],

			"MENETLUSSE_VOETUD status": [{
				responsibleCommittee: [{name: "Sotsiaalkomisjon"}],
				statuses: [{date: "2018-10-24", status: {code: "MENETLUSSE_VOETUD"}}]
			}, {
				parliament_committee: "Sotsiaalkomisjon",
				accepted_by_parliament_at: new Date(2018, 9, 24)
			}, {
				occurred_at: new Date(2018, 9, 24),
				origin: "parliament",
				external_id: "MENETLUSSE_VOETUD",
				type: "parliament-accepted",
				title: null,
				content: {committee: "Sotsiaalkomisjon"},
			}],

			"ARUTELU_KOMISJONIS status": [{
				responsibleCommittee: [{name: "Sotsiaalkomisjon"}],
				statuses: [{
					date: "2018-10-24",
					status: {code: "ARUTELU_KOMISJONIS"},

					relatedOuterLinks: [{
            outerLinkTitle: "Stenogramm",
            outerLink: "https://stenogrammid.riigikogu.ee"
					}, {
            outerLinkTitle: "Riigikogu istung",
            outerLink: "https://www.youtube.com"
					}]
				}]
			}, {
				parliament_committee: "Sotsiaalkomisjon"
			}, {
				occurred_at: new Date(2018, 9, 24),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2018-10-24",
				type: "parliament-committee-meeting",
				title: null,

				content: {
					committee: "Sotsiaalkomisjon",
					invitees: null,

					links: [
						{title: "Stenogramm", url: "https://stenogrammid.riigikogu.ee"},
						{title: "Riigikogu istung", url: "https://www.youtube.com"}
					]
				}
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

				content: {
					committee: null,
					decision: "continue",
					invitees: null,
					links: []
				},
			}],

			"ARUTELU_KOMISJONIS status with AVALIK_ISTUNG decision": [{
				statuses: [{
					date: "2018-10-24",
					status: {code: "ARUTELU_KOMISJONIS"},
					committeeDecision: {code: "AVALIK_ISTUNG"}
				}]
			}, null, {
				occurred_at: new Date(2018, 9, 24),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2018-10-24",
				type: "parliament-committee-meeting",
				title: null,

				content: {
					committee: null,
					decision: "hold-public-hearing",
					invitees: null,
					links: []
				},
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

				content: {
					committee: null,
					decision: "solve-differently",
					invitees: null,
					links: []
				}
			}],

			"ARUTELU_KOMISJONIS status with ETTEPANEK_VALITSUSELE decision": [{
				statuses: [{
					date: "2018-10-24",
					status: {code: "ARUTELU_KOMISJONIS"},
					committeeDecision: {code: "ETTEPANEK_VALITSUSELE"}
				}]
			}, {
				parliament_decision: "forward-to-government",
			}, {
				occurred_at: new Date(2018, 9, 24),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2018-10-24",
				type: "parliament-committee-meeting",
				title: null,

				content: {
					committee: null,
					decision: "forward-to-government",
					invitees: null,
					links: []
				}
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

				content: {
					committee: null,
					decision: "reject",
					invitees: null,
					links: []
				}
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

				content: {
					committee: null,
					decision: "forward",
					invitees: null,
					links: []
				}
			}],

			"ARUTELU_KOMISJONIS status with ALGATADA_EELNOU_VOI_OTRK decision": [{
				statuses: [{
					date: "2018-10-24",
					status: {code: "ARUTELU_KOMISJONIS"},
					committeeDecision: {code: "ALGATADA_EELNOU_VOI_OTRK"}
				}]
			}, {
				parliament_decision: "draft-act-or-national-matter",
			}, {
				occurred_at: new Date(2018, 9, 24),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2018-10-24",
				type: "parliament-committee-meeting",
				title: null,

				content: {
					committee: null,
					decision: "draft-act-or-national-matter",
					invitees: null,
					links: []
				}
			}],

			"ARUTELU_TAISKOGUL status": [{
				statuses: [{
					date: "2018-10-24",
					status: {code: "ARUTELU_TAISKOGUL"},

					relatedOuterLinks: [{
            outerLinkTitle: "Stenogramm",
            outerLink: "https://stenogrammid.riigikogu.ee"
					}, {
            outerLinkTitle: "Riigikogu istung",
            outerLink: "https://www.youtube.com"
					}]
				}]
			}, {}, {
				occurred_at: new Date(2018, 9, 24),
				origin: "parliament",
				external_id: "ARUTELU_TAISKOGUL/2018-10-24",
				type: "parliament-plenary-meeting",
				title: null,

				content: {
					links: [
						{title: "Stenogramm", url: "https://stenogrammid.riigikogu.ee"},
						{title: "Riigikogu istung", url: "https://www.youtube.com"}
					]
				}
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

			"TAGASTATUD status": [{
				statuses: [{date: "2018-10-24", status: {code: "TAGASTATUD"}}]
			}, {
				finished_in_parliament_at: new Date(2018, 9, 24),
				parliament_decision: "return"
			}, {
				occurred_at: new Date(2018, 9, 24),
				origin: "parliament",
				external_id: "TAGASTATUD",
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
				finished_in_parliament_at: new Date(2018, 9, 24),
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
				finished_in_parliament_at: new Date(2018, 9, 24),
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

				content: {
					committee: null,
					decision: "solve-differently",
					invitees: null,
					links: []
				}
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

				content: {
					committee: null,
					decision: "reject",
					invitees: null,
					links: []
				}
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

				content: {
					committee: null,
					decision: "forward",
					invitees: null,
					links: []
				}
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
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					parliament_uuid: INITIATIVE_UUID
				}))

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

		it("must create events given status with related documents", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: (yield usersDb.create(new ValidUser)).id,
				parliament_uuid: INITIATIVE_UUID
			}))

			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,

				statuses: [{
					date: "2015-06-17",
					status: {code: "MENETLUSSE_VOETUD"},
					relatedDocuments: [{uuid: DOCUMENT_UUID}]
				}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Kollektiivse pöördumise menetlusse võtmine",
				created: "2015-06-18T13:37:42.666",
				documentType: "decisionDocument",

				files: [{
					uuid: FILE_UUID,
					fileName: "Pöördumine.pdf",
					accessRestrictionType: "PUBLIC"
				}]
			}))

			this.router.get(`/download/${FILE_UUID}`,
				respondWithRiigikoguDownload.bind(null,
					"application/octet-stream",
					"\x0d\x25"
				)
			)

			yield job()

			var updatedInitiative = yield initiativesDb.read(initiative)
			updatedInitiative.must.eql(_.assign({}, initiative, {
				accepted_by_parliament_at: new Date(2015, 5, 17),
				parliament_api_data: updatedInitiative.parliament_api_data,
				parliament_synced_at: new Date
			}))

			yield eventsDb.search(sql`
				SELECT * FROM initiative_events
			`).must.then.eql([new ValidEvent({
				id: 1,
				initiative_uuid: initiative.uuid,
				occurred_at: new Date(2015, 5, 17),
				origin: "parliament",
				external_id: "MENETLUSSE_VOETUD",
				type: "parliament-accepted",
				title: null,
				content: {committee: null}
			})])

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.eql([new ValidFile({
				id: 1,
				event_id: 1,
				initiative_uuid: initiative.uuid,
				external_id: FILE_UUID,
				name: "Pöördumine.pdf",
				title: "Kollektiivse pöördumise menetlusse võtmine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream"),
				external_url: PARLIAMENT_URL + "/download/" + FILE_UUID
			})])
		})

		it("must create separate events given status with related incoming letter documents", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: (yield usersDb.create(new ValidUser)).id,
				parliament_uuid: INITIATIVE_UUID
			}))

			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,

				statuses: [{
					date: "2015-06-20",
					status: {code: "ARUTELU_KOMISJONIS"},
					relatedDocuments: [{uuid: DOCUMENT_UUID}]
				}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Linnujahi korraldamine",
				documentType: "letterDocument",
				created: "2015-06-18T13:37:42.666",
				author: "Jahimeeste Selts",
				authorDate: "2015-06-17",
				direction: {code: "SISSE"},
				receiveType: {code: "E_POST"},

				files: [{
					uuid: FILE_UUID,
					fileName: "Kiri.pdf",
					accessRestrictionType: "PUBLIC"
				}]
			}))

			this.router.get(`/download/${FILE_UUID}`,
				respondWithRiigikoguDownload.bind(null,
					"application/octet-stream",
					"\x0d\x25"
				)
			)

			yield job()

			var updatedInitiative = yield initiativesDb.read(initiative)
			updatedInitiative.must.eql(_.assign({}, initiative, {
				parliament_api_data: updatedInitiative.parliament_api_data,
				parliament_synced_at: new Date
			}))

			yield eventsDb.search(sql`
				SELECT * FROM initiative_events
			`).must.then.eql([new ValidEvent({
				id: 1,
				initiative_uuid: initiative.uuid,
				occurred_at: new Date(2015, 5, 20),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-20",
				type: "parliament-committee-meeting",
				title: null,
				content: {committee: null, invitees: null, links: []}
			}), new ValidEvent({
				id: 2,
				initiative_uuid: initiative.uuid,
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-letter",
				title: null,

				content: {
					medium: "email",
					direction: "incoming",
					title: "Linnujahi korraldamine",
					from: "Jahimeeste Selts",
					date: "2015-06-17"
				}
			})])

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.eql([new ValidFile({
				id: 1,
				event_id: 2,
				initiative_uuid: initiative.uuid,
				external_id: FILE_UUID,
				name: "Kiri.pdf",
				title: "Linnujahi korraldamine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream"),
				external_url: PARLIAMENT_URL + "/download/" + FILE_UUID
			})])
		})

		it("must update acceptance event", function*() {
			var requested = 0
			this.router.get(INITIATIVES_URL, function(req, res) {
				if (requested++ == 0) respond([{
					uuid: INITIATIVE_UUID,
					responsibleCommittee: [{name: "Sotsiaalkomisjon"}],
					statuses: [{date: "2015-06-18", status: {code: "MENETLUSSE_VOETUD"}}]
				}], req, res)
				else respond([{
					uuid: INITIATIVE_UUID,
					responsibleCommittee: [{name: "Majanduskomisjon"}],
					statuses: [{date: "2015-06-18", status: {code: "MENETLUSSE_VOETUD"}}]
				}], req, res)
			})

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)
			yield job()

			var event = yield eventsDb.read(sql`SELECT * FROM initiative_events`)
			yield job()
			yield eventsDb.read(event).must.then.eql(event)
		})

		it("must update committee meeting event", function*() {
			var requested = 0
			this.router.get(INITIATIVES_URL, function(req, res) {
				if (requested++ == 0) respond([{
					uuid: INITIATIVE_UUID,
					responsibleCommittee: [{name: "Sotsiaalkomisjon"}],
					statuses: [{
						date: "2018-10-24",
						status: {code: "ARUTELU_KOMISJONIS"},
						committeeDecision: {code: "JATKATA_ARUTELU"}
					}]
				}], req, res)
				else respond([{
					uuid: INITIATIVE_UUID,
					responsibleCommittee: [{name: "Majanduskomisjon"}],
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
					invitees: null,
					links: [],
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

		;[
			"REGISTREERITUD",
			"MENETLUSSE_VOETUD",
			"ARUTELU_KOMISJONIS",
			"MENETLUS_LOPETATUD"
		].forEach(function(code) {
			it("must not update event if not changed given " + code, function*() {
				this.router.get(INITIATIVES_URL, respond.bind(null, [{
					uuid: INITIATIVE_UUID,
					statuses: [{date: "2015-06-18", status: {code:code}}]
				}]))

				this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)
				yield job()

				var initiative = yield initiativesDb.read(sql`
					SELECT * FROM initiatives
				`)

				var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)
				events.length.must.equal(1)

				this.time.tick(1000)
				yield job(["parliament-sync", "--force"])

				;(yield initiativesDb.read(sql`
					SELECT * FROM initiatives
				`)).parliament_synced_at.must.not.eql(initiative.parliament_synced_at)

				yield eventsDb.search(sql`
					SELECT * FROM initiative_events
				`).must.then.eql(events)
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
	})

	describe("given volume", function() {
		it("must create events when in a volume of letters, with letters", function*() {
			// NOTE: Initiative volume is missing on the collective-addresses
			// collection response.
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
				uuid: INITIATIVE_UUID,
				volume: {uuid: VOLUME_UUID}
			}))

			this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
				uuid: VOLUME_UUID,
				title: "Kollektiivne pöördumine Elu paremaks!",
				volumeType: "letterVolume",
				documents: [{uuid: INITIATIVE_UUID}, {uuid: DOCUMENT_UUID}]
			}))

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Linnujahi korraldamine",
				documentType: "letterDocument",
				created: "2015-06-18T13:37:42.666",
				author: "Jahimeeste Selts",
				authorDate: "2015-06-17",
				direction: {code: "SISSE"},
				receiveType: {code: "E_POST"},

				files: [{
					uuid: FILE_UUID,
					fileName: "Kiri.pdf",
					accessRestrictionType: "PUBLIC"
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
				type: "parliament-letter",
				title: null,

				content: {
					medium: "email",
					direction: "incoming",
					title: "Linnujahi korraldamine",
					from: "Jahimeeste Selts",
					date: "2015-06-17"
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
				name: "Kiri.pdf",
				title: "Linnujahi korraldamine",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: new MediaType("application/pdf")
			})])
		})

		it("must create events for volume's related documents", function*() {
			// NOTE: Initiative volume is missing on the collective-addresses
			// collection response.
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
				uuid: INITIATIVE_UUID,
				volume: {uuid: VOLUME_UUID}
			}))

			this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
				uuid: VOLUME_UUID,
				title: "Kollektiivne pöördumine Elu paremaks!",
				volumeType: "letterVolume",
				relatedDocuments: [{uuid: INITIATIVE_UUID}, {uuid: DOCUMENT_UUID}]
			}))

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Eemaldamise nõue",
				created: "2015-06-18T13:37:42.666",
				documentType: "letterDocument",
				direction: {code: "VALJA"},
				receiveType: {code: "E_POST"},

				files: [{
					uuid: FILE_UUID,
          fileName: "eemaldamine.pdf",
					accessRestrictionType: "PUBLIC"
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
				type: "parliament-letter",
				title: null,

				content: {
					medium: "email",
					direction: "outgoing",
					title: "Eemaldamise nõue"
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
				name: "eemaldamine.pdf",
				title: "Eemaldamise nõue",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: new MediaType("application/pdf")
			})])
		})
	})

	// NOTE: Don't set properties that are only available under
	// /collective-addresses for tests that don't refer to statuses. This
	// ensures the functions behave correctly when given older initiatives,
	// too.
	describe("given related documents", function() {
		it(`must update initiative and create events and files given response letter`, function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: (yield usersDb.create(new ValidUser)).id,
				parliament_uuid: INITIATIVE_UUID
			}))

			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "ÕIGK vastuskiri - Kollektiivne pöördumine X",
				created: "2015-06-18T13:37:42.666",
				documentType: "letterDocument",
				direction: {code: "VALJA"},

				files: [{
					uuid: FILE_UUID,
					fileName: "ÕIGK_11062019.pdf",
					accessRestrictionType: "PUBLIC"
				}]
			}))

			this.router.get(`/download/${FILE_UUID}`,
				respondWithRiigikoguDownload.bind(null,
					"application/octet-stream",
					"\x0d\x25"
				)
			)

			yield job()

			var updatedInitiative = yield initiativesDb.read(initiative)
			updatedInitiative.must.eql(_.assign({}, initiative, {
				finished_in_parliament_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				parliament_api_data: updatedInitiative.parliament_api_data,
				parliament_synced_at: new Date
			}))

			yield eventsDb.search(sql`
				SELECT * FROM initiative_events
			`).must.then.eql([new ValidEvent({
				id: 1,
				initiative_uuid: initiative.uuid,
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: "MENETLUS_LOPETATUD",
				type: "parliament-finished",
				title: null,
				content: null
			})])

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.eql([new ValidFile({
				id: 1,
				event_id: 1,
				initiative_uuid: initiative.uuid,
				external_id: FILE_UUID,
				name: "ÕIGK_11062019.pdf",
				title: "ÕIGK vastuskiri - Kollektiivne pöördumine X",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream"),
				external_url: PARLIAMENT_URL + "/download/" + FILE_UUID
			})])
		})

		_.each({
			"acceptance decision": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Kollektiivse pöördumise menetlusse võtmine",
					created: "2015-06-18T13:37:42.666",
					documentType: "decisionDocument",
					decisionDate: "2015-06-17",

					files: [{
						uuid: FILE_UUID,
						fileName: "Kollektiivse_pöördumise_menetlusse_võtmine.asice",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: "MENETLUSSE_VOETUD",
				type: "parliament-accepted",
				title: null,
				content: {date: "2015-06-17"}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Kollektiivse_pöördumise_menetlusse_võtmine.asice",
				title: "Kollektiivse pöördumise menetlusse võtmine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			// A response letter _not_ indicating the end of processing:
			// https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/122177be-552e-4757-9828-77ee1e9630c7
			"response letter for clarification": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Vastuskiri - Kollektiivse pöördumisega seotud selgitustaotlus",
					created: "2015-06-18T13:37:42.666",
					documentType: "letterDocument",
					direction: {code: "VALJA"},
					receiveType: {code: "E_POST"},
					author: "Jahimeeste Selts",
					authorDate: "2015-06-17",

					files: [{
						uuid: "811eac10-a47e-468f-bec9-56c790157f08",
						fileName: "Vastuskiri.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-letter",
				title: null,

				content: {
					medium: "email",
					direction: "outgoing",
					title:
						"Vastuskiri - Kollektiivse pöördumisega seotud selgitustaotlus",
					to: "Jahimeeste Selts",
					date: "2015-06-17"
				}
			}, [{
				id: 1,
				event_id: 1,
				external_id: "811eac10-a47e-468f-bec9-56c790157f08",
				name: "Vastuskiri.pdf",
				title: "Vastuskiri - Kollektiivse pöördumisega seotud selgitustaotlus",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"board meeting protocol with date": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "18.06.2015 juhatuse istungi protokoll",
					documentType: "protokoll",

					volume: {
						uuid: VOLUME_UUID,
						title: "Juhatuse istungite protokollid 2015",
						volumeType: "dokumenditoimik",
					},

					files: [{
						uuid: FILE_UUID,
						fileName: "Protokoll.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-board-meeting",
				title: null,
				content: {}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Protokoll.pdf",
				title: "18.06.2015 juhatuse istungi protokoll",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			// Not all committee meeting protocols have a time in their title.
			// For example: https://api.riigikogu.ee/api/documents/e1fe09a3-f62c-44f5-8018-a4800f8ab7d9.
			"committee meeting protocol with date": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Protokoll",
					documentType: "protokoll",

					volume: {
						uuid: VOLUME_UUID,
						reference: "1-3/KEKK/3-7",
						title: "Komisjoni istung teisipäev, 18.06.2015, 15 minutit hiljem",
						volumeType: "unitSittingVolume",
					},

					files: [{
						uuid: FILE_UUID,
						fileName: "Protokoll.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
				type: "parliament-committee-meeting",
				title: null,
				content: {committee: "Keskkonnakomisjon", invitees: null}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Protokoll.pdf",
				title: "Protokoll",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"committee meeting protocol with date and time": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Protokoll",
					documentType: "protokoll",

					volume: {
						uuid: VOLUME_UUID,
						reference: "1-3/KEKK/3-7",
						title: "Komisjoni istung teisipäev, 18.06.2015 13:37",
						volumeType: "unitSittingVolume",
					},

					files: [{
						uuid: FILE_UUID,
						fileName: "Protokoll.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
				type: "parliament-committee-meeting",
				title: null,
				content: {committee: "Keskkonnakomisjon", invitees: null}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Protokoll.pdf",
				title: "Protokoll",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"committee meeting protocol with date and time with \"kell\"": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Protokoll",
					documentType: "protokoll",

					volume: {
						uuid: VOLUME_UUID,
						reference: "1-3/KEKK/3-7",
						title: "Komisjoni istung teisipäev, 18.06.2015 kell 13:37",
						volumeType: "unitSittingVolume",
					},

					files: [{
						uuid: FILE_UUID,
						fileName: "Protokoll.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
				type: "parliament-committee-meeting",
				title: null,
				content: {committee: "Keskkonnakomisjon", invitees: null}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Protokoll.pdf",
				title: "Protokoll",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"decision document": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Otsuse muutmine",
					documentType: "decisionDocument",
					created: "2015-06-18T13:37:42.666",
					decisionDate: "2015-06-17",

					files: [{
						uuid: FILE_UUID,
						fileName: "Otsus.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-decision",
				title: null,
				content: {date: "2015-06-17"}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Otsus.pdf",
				title: "Otsuse muutmine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"outgoing post document": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Linnujahi korraldamine",
					documentType: "letterDocument",
					created: "2015-06-18T13:37:42.666",
					author: "Jahimeeste Selts",
					authorDate: "2015-06-17",
					direction: {code: "VALJA"},
					receiveType: {code: "TAVAPOST"},

					files: [{
						uuid: FILE_UUID,
						fileName: "Kiri.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-letter",
				title: null,

				content: {
					medium: "post",
					direction: "outgoing",
					title: "Linnujahi korraldamine",
					to: "Jahimeeste Selts",
					date: "2015-06-17"
				}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Kiri.pdf",
				title: "Linnujahi korraldamine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"outgoing email document": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Linnujahi korraldamine",
					documentType: "letterDocument",
					created: "2015-06-18T13:37:42.666",
					author: "Jahimeeste Selts",
					authorDate: "2015-06-17",
					direction: {code: "VALJA"},
					receiveType: {code: "E_POST"},

					files: [{
						uuid: FILE_UUID,
						fileName: "Kiri.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-letter",
				title: null,

				content: {
					medium: "email",
					direction: "outgoing",
					title: "Linnujahi korraldamine",
					to: "Jahimeeste Selts",
					date: "2015-06-17"
				}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Kiri.pdf",
				title: "Linnujahi korraldamine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"incoming email document": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Linnujahi korraldamine",
					documentType: "letterDocument",
					created: "2015-06-18T13:37:42.666",
					author: "Jahimeeste Selts",
					authorDate: "2015-06-17",
					direction: {code: "SISSE"},
					receiveType: {code: "E_POST"},

					files: [{
						uuid: FILE_UUID,
						fileName: "Kiri.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-letter",
				title: null,

				content: {
					medium: "email",
					direction: "incoming",
					title: "Linnujahi korraldamine",
					from: "Jahimeeste Selts",
					date: "2015-06-17"
				}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Kiri.pdf",
				title: "Linnujahi korraldamine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"internal paper document": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Linnujahi korraldamine",
					documentType: "letterDocument",
					created: "2015-06-18T13:37:42.666",
					author: "Jahimeeste Selts",
					authorDate: "2015-06-17",
					direction: {code: "SISEMINE"},
					receiveType: {code: "KASIPOST"},

					files: [{
						uuid: FILE_UUID,
						fileName: "Kiri.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-letter",
				title: null,

				content: {
					medium: "post",
					direction: "outgoing",
					title: "Linnujahi korraldamine",
					to: "Jahimeeste Selts",
					date: "2015-06-17"
				}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Kiri.pdf",
				title: "Linnujahi korraldamine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"document exchange document": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Linnujahi korraldamine",
					documentType: "letterDocument",
					created: "2015-06-18T13:37:42.666",
					author: "Jahimeeste Selts",
					authorDate: "2015-06-17",
					direction: {code: "VALJA"},
					receiveType: {code: "DVK"},

					files: [{
						uuid: FILE_UUID,
						fileName: "Kiri.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-letter",
				title: null,

				content: {
					medium: "dokumendivahetuskeskus",
					direction: "outgoing",
					title: "Linnujahi korraldamine",
					to: "Jahimeeste Selts",
					date: "2015-06-17"
				}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Kiri.pdf",
				title: "Linnujahi korraldamine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"dhx document": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Linnujahi korraldamine",
					documentType: "letterDocument",
					created: "2015-06-18T13:37:42.666",
					author: "Jahimeeste Selts",
					authorDate: "2015-06-17",
					direction: {code: "VALJA"},
					receiveType: {code: "DHX"},

					files: [{
						uuid: FILE_UUID,
						fileName: "Kiri.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-letter",
				title: null,

				content: {
					medium: "dhx",
					direction: "outgoing",
					title: "Linnujahi korraldamine",
					to: "Jahimeeste Selts",
					date: "2015-06-17"
				}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Kiri.pdf",
				title: "Linnujahi korraldamine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"MENETLUSSE_VOETUD status and decision": [{
				responsibleCommittee: [{name: "Keskkonnakomisjon"}],
				statuses: [{date: "2015-06-18", status: {code: "MENETLUSSE_VOETUD"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Kollektiivse pöördumise menetlusse võtmine",
					documentType: "decisionDocument",

					files: [{
						uuid: FILE_UUID,
						fileName: "Kollektiivse_pöördumise_menetlusse_võtmine.asice",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18),
				origin: "parliament",
				external_id: "MENETLUSSE_VOETUD",
				type: "parliament-accepted",
				title: null,
				content: {committee: "Keskkonnakomisjon"}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Kollektiivse_pöördumise_menetlusse_võtmine.asice",
				title: "Kollektiivse pöördumise menetlusse võtmine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			// https://api.riigikogu.ee/api/documents/9eb9dfd0-2a2f-4eaf-bdf4-1552ed89a7ae
			"MENETLUSSE_VOETUD status and board meeting protocol": [{
				responsibleCommittee: [{name: "Keskkonnakomisjon"}],
				statuses: [{date: "2015-06-18", status: {code: "MENETLUSSE_VOETUD"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "18.06.2015 juhatuse istungi protokoll",
					documentType: "protokoll",

					files: [{
						uuid: FILE_UUID,
						fileName: "Protokoll.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18),
				origin: "parliament",
				external_id: "MENETLUSSE_VOETUD",
				type: "parliament-accepted",
				title: null,
				content: {committee: "Keskkonnakomisjon"}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Protokoll.pdf",
				title: "18.06.2015 juhatuse istungi protokoll",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"MENETLUSSE_VOETUD status and board meeting protocol with no leading zeroes": [{
				responsibleCommittee: [{name: "Keskkonnakomisjon"}],
				statuses: [{date: "2015-06-01", status: {code: "MENETLUSSE_VOETUD"}}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "1.6.2015 juhatuse istungi protokoll",
					documentType: "protokoll",

					files: [{
						uuid: FILE_UUID,
						fileName: "Protokoll.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 1),
				origin: "parliament",
				external_id: "MENETLUSSE_VOETUD",
				type: "parliament-accepted",
				title: null,
				content: {committee: "Keskkonnakomisjon"}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Protokoll.pdf",
				title: "1.6.2015 juhatuse istungi protokoll",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			// Ensures the committee is overwritten from the protocol.
			"ARUTELU_KOMISJONIS status and different committee meeting protocol": [{
				statuses: [{date: "2015-06-18", status: {code: "ARUTELU_KOMISJONIS"}}],
				responsibleCommittee: [{name: "Rahanduskomisjon"}],
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Protokoll",
					documentType: "protokoll",

					volume: {
						uuid: VOLUME_UUID,
						reference: "1-3/KEKK/3-7",
						title: "Komisjoni istung teisipäev, 18.06.2015 13:37",
						volumeType: "unitSittingVolume",
					},

					files: [{
						uuid: FILE_UUID,
						fileName: "Protokoll.pdf",
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18, 13, 37),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
				type: "parliament-committee-meeting",
				title: null,

				content: {
					committee: "Keskkonnakomisjon",
					invitees: null,
					links: []
				}
			}, [{
				id: 1,
				event_id: 1,
				external_id: FILE_UUID,
				name: "Protokoll.pdf",
				title: "Protokoll",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"MENETLUS_LOPETATUD status and response letter": [{
				statuses: [{date: "2015-06-18", status: {code: "MENETLUS_LOPETATUD"}}],
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
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18),
				origin: "parliament",
				external_id: "MENETLUS_LOPETATUD",
				type: "parliament-finished",
				title: null,
				content: null
			}, [{
				id: 1,
				event_id: 1,
				external_id: "811eac10-a47e-468f-bec9-56c790157f08",
				name: "ÕIGK_11062019.pdf",
				title: "ÕIGK vastuskiri - Kollektiivne pöördumine X",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"MENETLUS_LOPETATUD status and response with \"vastuskiri\" at the end": [{
				statuses: [{date: "2015-06-18", status: {code: "MENETLUS_LOPETATUD"}}],
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
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18),
				origin: "parliament",
				external_id: "MENETLUS_LOPETATUD",
				type: "parliament-finished",
				title: null,
				content: null
			}, [{
				id: 1,
				event_id: 1,
				external_id: "811eac10-a47e-468f-bec9-56c790157f08",
				name: "ÕIGK_11062019.pdf",
				title: "Kollektiivne pöördumine X - ÕISK vastuskiri reformimiseks",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]],

			"MENETLUS_LOPETATUD status and response with \"vastuskiri\" capitalized": [{
				statuses: [{date: "2015-06-18", status: {code: "MENETLUS_LOPETATUD"}}],
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
						accessRestrictionType: "PUBLIC"
					}]
				}
			}, {
				occurred_at: new Date(2015, 5, 18),
				origin: "parliament",
				external_id: "MENETLUS_LOPETATUD",
				type: "parliament-finished",
				title: null,
				content: null
			}, [{
				id: 1,
				event_id: 1,
				external_id: "811eac10-a47e-468f-bec9-56c790157f08",
				name: "ÕIGK_11062019.pdf",
				title: "Vastuskiri - Kollektiivne pöördumine X",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: EXAMPLE_BUFFER,
				content_type: new MediaType("application/octet-stream")
			}]]
		}, function(test, title) {
			var api = test[0]
			var documents = test[1]
			var eventAttrs = test[2]
			var files = test[3]

			it(`must create events and files given ${title}`,
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					parliament_uuid: INITIATIVE_UUID
				}))

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

				var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)
				events.must.eql(concat(eventAttrs).map((attrs, i) => new ValidEvent({
					__proto__: attrs,
					id: i + 1,
					initiative_uuid: initiative.uuid
				})))

				yield filesDb.search(sql`
					SELECT * FROM initiative_files
				`).must.then.eql(files.map((file) => new ValidFile({
					__proto__: file,
					initiative_uuid: initiative.uuid,
					external_url: PARLIAMENT_URL + "/download/" + file.external_id
				})))
			})
		})

		it("must download only public files", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Kollektiivse pöördumise menetlusse võtmine",
				created: "2015-06-18T13:37:42.666",
				documentType: "decisionDocument",

				files: [{
					uuid: "005e0726-0886-4bc9-ad3a-f900f0173cf7",
					fileName: "Kollektiivse_pöördumise_menetlusse_võtmine.asice",
					accessRestrictionType: "PUBLIC"
				}, {
					uuid: "04bfcebd-c4ae-43b8-8274-d1d7cf6407bc",
					fileName: "Pöördumise allkirjade register _30_10_2018.xlsx",
					accessRestrictionType: "FOR_USE_WITHIN_ESTABLISHMENT",
				}, {
					uuid: "eef04b9e-2d78-404b-b41b-679817e99d53",
					fileName: "70_17.06.2019_pöördumine.pdf",
					accessRestrictionType: "PUBLIC"
				}]
			}))

			this.router.get("/download/005e0726-0886-4bc9-ad3a-f900f0173cf7",
				respondWithRiigikoguDownload.bind(null, "application/zip", "ASICE")
			)

			this.router.get("/download/eef04b9e-2d78-404b-b41b-679817e99d53",
				respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
			)

			yield job()

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.eql([new ValidFile({
				id: 1,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: "005e0726-0886-4bc9-ad3a-f900f0173cf7",
				name: "Kollektiivse_pöördumise_menetlusse_võtmine.asice",
				title: "Kollektiivse pöördumise menetlusse võtmine",
				external_url:
					PARLIAMENT_URL + "/download/005e0726-0886-4bc9-ad3a-f900f0173cf7",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: new Buffer("ASICE"),
				content_type: new MediaType("application/zip")
			}), new ValidFile({
				id: 2,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: "eef04b9e-2d78-404b-b41b-679817e99d53",
				name: "70_17.06.2019_pöördumine.pdf",
				title: "Kollektiivse pöördumise menetlusse võtmine",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				external_url:
					PARLIAMENT_URL + "/download/eef04b9e-2d78-404b-b41b-679817e99d53",
				content: new Buffer("PDF"),
				content_type: new MediaType("application/pdf")
			})])
		})

		it("must use related document file title if available", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "ÕIGK vastuskiri - Kollektiivne pöördumine X",
				created: "2015-06-18T13:37:42.666",
				documentType: "letterDocument",
				direction: {code: "VALJA"},

				files: [{
					uuid: FILE_UUID,
          fileName: "vastuskiri.pdf",
          fileTitle: "Vastuskiri",
					accessRestrictionType: "PUBLIC"
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
				content_type: new MediaType("application/pdf")
			})])
		})

		// https://www.riigikogu.ee/riigikogu/koosseis/muudatused-koosseisus/
		_.each({
			ELAK: "Euroopa Liidu asjade komisjon",
			KEKK: "Keskkonnakomisjon",
			KULK: "Kultuurikomisjon",
			MAEK: "Maaelukomisjon",
			MAJK: "Majanduskomisjon",
			PÕSK: "Põhiseaduskomisjon",
			RAHK: "Rahanduskomisjon",
			RIKK: "Riigikaitsekomisjon",
			SOTK: "Sotsiaalkomisjon",
			VÄLK: "Väliskomisjon",
			ÕIGK: "Õiguskomisjon"
		}, function(name, code) {
			it("must create event given committee meeting protocol of " + name, function*() {
				this.router.get(INITIATIVES_URL, respond.bind(null, [{
					uuid: INITIATIVE_UUID,
					relatedDocuments: [{uuid: DOCUMENT_UUID}]
				}]))

				this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

				this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
					uuid: DOCUMENT_UUID,
					title: "Protokoll",
					documentType: "protokoll",

					volume: {
						uuid: VOLUME_UUID,
						reference: `1-3/${code}/3-7`,
						title: "Komisjoni istung teisipäev, 18.06.2015 13:37",
						volumeType: "unitSittingVolume",
					},

					files: [{
						uuid: FILE_UUID,
						fileName: "Protokoll.pdf",
						accessRestrictionType: "PUBLIC"
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
					occurred_at: new Date(2015, 5, 18, 13, 37),
					origin: "parliament",
					external_id: "ARUTELU_KOMISJONIS/2015-06-18",
					type: "parliament-committee-meeting",
					title: null,
					content: {committee: name, invitees: null}
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
					title: "Protokoll",
					url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
					content: Buffer.from("PDF"),
					content_type: new MediaType("application/pdf")
				})])
			})
		})

		it("must not create event given non-committee meeting protocol ",
			function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Secret meeting",
				documentType: "protokoll",

				volume: {
					uuid: VOLUME_UUID,
					title: "Secret meetings 2015",
					volumeType: "unitSittingVolume",
				},

				files: [{
					uuid: FILE_UUID,
					fileName: "Protokoll.pdf",
					accessRestrictionType: "PUBLIC"
				}]
			}))

			yield job()

			yield eventsDb.search(sql`
				SELECT * FROM initiative_events
			`).must.then.be.empty()

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.be.empty()
		})

		it("must not create event given letter with no public files", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Linnujahi korraldamine",
				documentType: "letterDocument",
				created: "2015-06-18T13:37:42.666",
				author: "Jahimeeste Selts",
				authorDate: "2015-06-17",
				direction: {code: "SISSE"},
				receiveType: {code: "E_POST"},

				files: [{
					uuid: FILE_UUID,
					fileName: "Kiri.pdf",
					accessRestrictionType: "FOR_USE_WITHIN_ESTABLISHMENT"
				}]
			}))

			yield job()

			yield eventsDb.search(sql`
				SELECT * FROM initiative_events
			`).must.then.be.empty()

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.be.empty()
		})

		// There's another test elsewhere that tests given an agenda item *with*
		// a volume.
		it("must create event given a document representing an agenda item without related volume", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Kollektiivne pöördumine haruapteekide säilitamise osas",
				documentType: "unitAgendaItemDocument",
				invitees: "Sotsiaalministeeriumi terviseala asekantsler",
				volume: {uuid: VOLUME_UUID}
			}))

			var minutesUuid = newUuid()

			this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
				uuid: VOLUME_UUID,
				title: "Komisjoni istung teisipäev, 18.06.2015 13:37",
				reference: "1-3/SOTK/3-7",
				volumeType: "unitSittingVolume",

				documents: [{
					uuid: DOCUMENT_UUID,
					title: "Kollektiivne pöördumine haruapteekide säilitamise osas",
					documentType: "unitAgendaItemDocument",
				}, {
					uuid: minutesUuid,
					title: "Protokoll",
					documentType: "protokoll"
				}]
			}))

			this.router.get(`/api/documents/${minutesUuid}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Protokoll",
				documentType: "protokoll",

				files: [{
					uuid: FILE_UUID,
					fileName: "Protokoll.pdf",
					accessRestrictionType: "PUBLIC"
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
				occurred_at: new Date(2015, 5, 18, 13, 37),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
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
				title: "Protokoll",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: new MediaType("application/pdf")
			})])
		})

		it("must create event given a document of national matter", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "OTRK: Important",
				created: "2015-06-18T13:37:42.666",
				documentType: "otherQuestionDocument",
				subType: {code: "OLULISE_TAHTSUSEGA_RIIKLIK_KUSIMUS"},

				files: [{
					uuid: FILE_UUID,
					fileName: "Slides.pdf",
					accessRestrictionType: "PUBLIC"
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
				type: "parliament-national-matter",
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
				name: "Slides.pdf",
				title: "OTRK: Important",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: new MediaType("application/pdf")
			})])
		})

		// https://github.com/riigikogu-kantselei/api/issues/28
		it("must ignore unavailable agenda documents", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,

				relatedDocuments: [{
					uuid: DOCUMENT_UUID,
					documentType: "unitAgendaItemDocument"
				}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(
				`/api/documents/${DOCUMENT_UUID}`,
				respondWithNotFound.bind(null, INITIATIVE_UUID)
			)

			yield job()
		})

		// Draft act's opinion documents are unavailable via the documents API and
		// supposedly are meant to be loaded along with the draft act from
		// /volumes/drafts. But they don't tell you the draft act UUID...
		it("must ignore unavailable draft act opinion documents", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,

				relatedDocuments: [{
					uuid: DOCUMENT_UUID,
					documentType: "opinionDocument"
				}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(
				`/api/documents/${DOCUMENT_UUID}`,
				respondWithNotFound.bind(null, INITIATIVE_UUID)
			)

			yield job()
		})

		it("must not ignore other unavailable documents", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,

				relatedDocuments: [{
					uuid: DOCUMENT_UUID,
					documentType: "decisionDocument"
				}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(
				`/api/documents/${DOCUMENT_UUID}`,
				respondWithNotFound.bind(null, INITIATIVE_UUID)
			)

			var err
			try { yield job() } catch (ex) { err = ex }
			err.must.be.an.error(FetchError)
		})
	})

	describe("given related volumes", function() {
		it("must create event given a volume of a committee meeting", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedVolumes: [{uuid: VOLUME_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
				uuid: VOLUME_UUID,
				title: "Komisjoni istung esmaspäev, 18.06.2015 13:37",
				reference: "1-3/KEKK/3-7",
				volumeType: "unitSittingVolume",

				documents: [{
					uuid: DOCUMENT_UUID,
					title: "Protokoll",
					documentType: "protokoll"
				}]
			}))

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Protokoll",
				documentType: "protokoll",
				volume: {uuid: VOLUME_UUID},

				files: [{
					uuid: FILE_UUID,
					fileName: "Protokoll.pdf",
					accessRestrictionType: "PUBLIC"
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
				occurred_at: new Date(2015, 5, 18, 13, 37),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
				type: "parliament-committee-meeting",
				title: null,
				content: {committee: "Keskkonnakomisjon", invitees: null}
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
				title: "Protokoll",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: new MediaType("application/pdf")
			})])
		})

		it("must create event given a volume of a committee meeting and an agenda item", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}],
				relatedVolumes: [{uuid: VOLUME_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Kollektiivne pöördumine haruapteekide säilitamise osas",
				documentType: "unitAgendaItemDocument",
				invitees: "Sotsiaalministeeriumi terviseala asekantsler",
				volume: {uuid: VOLUME_UUID}
			}))

			var minutesUuid = newUuid()

			this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
				uuid: VOLUME_UUID,
				title: "Komisjoni istung teisipäev, 18.06.2015 13:37",
				reference: "1-3/SOTK/3-7",
				volumeType: "unitSittingVolume",

				documents: [{
					uuid: DOCUMENT_UUID,
					title: "Kollektiivne pöördumine haruapteekide säilitamise osas",
					documentType: "unitAgendaItemDocument",
				}, {
					uuid: minutesUuid,
					title: "Protokoll",
					documentType: "protokoll"
				}]
			}))

			this.router.get(`/api/documents/${minutesUuid}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Protokoll",
				documentType: "protokoll",

				files: [{
					uuid: FILE_UUID,
					fileName: "Protokoll.pdf",
					accessRestrictionType: "PUBLIC"
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
				occurred_at: new Date(2015, 5, 18, 13, 37),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
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
				title: "Protokoll",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: new MediaType("application/pdf")
			})])
		})

		// Initiative https://api.riigikogu.ee/api/documents/collective-addresses/df08453e-a27f-48db-a095-6003142a999f
		// is an example where two "relatedVolumes" refer to meetings that, while
		// fortunately included in the "statuses" array, are not referred to in
		// "relatedDocuments".
		it("must create event given a status and volume of a committee meeting",
			function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,

				statuses: [
					{date: "2015-06-18", status: {code: "ARUTELU_KOMISJONIS"}}
				],

				relatedVolumes: [{
					uuid: VOLUME_UUID,
					title: "Komisjoni istung esmaspäev, 18.06.2015 13:37",
					volumeType: "unitSittingVolume"
				}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
				uuid: VOLUME_UUID,
				title: "Komisjoni istung esmaspäev, 18.06.2015 13:37",
				reference: "1-3/KEKK/3-7",
				volumeType: "unitSittingVolume",

				documents: [{
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
					fileName: "Protokoll.pdf",
					accessRestrictionType: "PUBLIC"
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
				occurred_at: new Date(2015, 5, 18, 13, 37),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
				type: "parliament-committee-meeting",
				title: null,

				content: {
					committee: "Keskkonnakomisjon",
					invitees: null,
					links: []
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
				title: "Protokoll",
				url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
				content: Buffer.from("PDF"),
				content_type: new MediaType("application/pdf")
			})])
		})

		it("must create event given a volume of an interpellation", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedVolumes: [{uuid: VOLUME_UUID}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			var aDocumentUuid = newUuid()
			var bDocumentUuid = newUuid()
			var aFileUuid = newUuid()
			var bFileUuid = newUuid()

			this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
				uuid: VOLUME_UUID,
				title: "Kollektiivse pöördumise \"Elu paremaks!\" kohta",
				volumeType: "interpellationsVolume",
				created: "2015-06-18T13:37:42.666",

				documents: [
					{uuid: aDocumentUuid, documentType: "interpellationsDocument"},
					{uuid: bDocumentUuid, documentType: "interpellationsAnswerDocument"}
				]
			}))

			this.router.get(`/api/documents/${aDocumentUuid}`, respond.bind(null, {
				uuid: aDocumentUuid,
				title: "Kollektiivse pöördumise \"Elu paremaks!\" kohta",
				documentType: "interpellationsDocument",

				submittingDate: "2016-04-11",
				answerDeadline: "2016-05-31",
				addressee: {value: "justiitsminister John Smith"},

				files: [{
					uuid: aFileUuid,
					fileName: "Question.pdf",
					accessRestrictionType: "PUBLIC"
				}]
			}))

			this.router.get(`/api/documents/${bDocumentUuid}`, respond.bind(null, {
				uuid: bDocumentUuid,
				title: "Kollektiivse pöördumise \"Elu paremaks!\" kohta",
				documentType: "interpellationsAnswerDocument",

				files: [{
					uuid: bFileUuid,
					fileName: "Answer.pdf",
					accessRestrictionType: "PUBLIC"
				}]
			}))

			this.router.get(`/download/${aFileUuid}`,
				respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF A")
			)

			this.router.get(`/download/${bFileUuid}`,
				respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF B")
			)

			yield job()

			var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)

			events.must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: VOLUME_UUID,
				type: "parliament-interpellation",
				title: null,

				content: {
					to: "justiitsminister John Smith",
					date: "2016-04-11",
					deadline: "2016-05-31"
				}
			})])

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.eql([new ValidFile({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				event_id: 1,
				external_id: aFileUuid,
				external_url: `https://www.riigikogu.ee/download/${aFileUuid}`,
				name: "Question.pdf",
				title: "Kollektiivse pöördumise \"Elu paremaks!\" kohta",
				url: DOCUMENT_URL + "/" + aDocumentUuid,
				content: Buffer.from("PDF A"),
				content_type: new MediaType("application/pdf")
			}), new ValidFile({
				id: 2,
				initiative_uuid: INITIATIVE_UUID,
				event_id: 1,
				external_id: bFileUuid,
				external_url: `https://www.riigikogu.ee/download/${bFileUuid}`,
				name: "Answer.pdf",
				title: "Kollektiivse pöördumise \"Elu paremaks!\" kohta",
				url: DOCUMENT_URL + "/" + bDocumentUuid,
				content: Buffer.from("PDF B"),
				content_type: new MediaType("application/pdf")
			})])
		})

		// As of Apr 8, 2021 it's still the case that opinion documents are
		// unavailable via the document API. They're also now attached as
		// relatedDocuments on some initiatives.
		// https://github.com/riigikogu-kantselei/api/issues/28
		it("must ignore draft act volume opinion documents", function*() {
			this.router.get(INITIATIVES_URL, respond.bind(null, [{
				uuid: INITIATIVE_UUID,
				relatedVolumes: [{uuid: VOLUME_UUID, volumeType: "eelnou"}]
			}]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondWithEmpty)

			var opinionUuid = newUuid()

			this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
				uuid: VOLUME_UUID,
				title: "Seaduse muutmise seaduse muutmise seadus",
				volumeType: "eelnou",
				created: "2015-06-18T13:37:42.666",
				documents: [{uuid: opinionUuid, documentType: "opinionDocument"}]
			}))

			this.router.get(
				`/api/documents/${opinionUuid}`,
				respondWithNotFound.bind(null, opinionUuid)
			)

			yield job()
		})
	})
})

function respondWithRiigikoguDownload(contentType, content, req, res) {
	// https://riigikogu.ee redirects to https://www.riigikogu.ee.
	req.headers.host.must.equal("www.riigikogu.ee")
	res.setHeader("Content-Type", contentType)
	res.end(content)
}

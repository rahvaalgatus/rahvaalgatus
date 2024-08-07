var _ = require("root/lib/underscore")
var Config = require("root").config
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
var {respond} = require("root/test/fixtures")
var {serializeMailgunVariables} = require("root/lib/subscription")
var newUuid = _.compose(_.serializeUuid, _.uuidV4)
var {formatDate} = require("root/lib/i18n")
var sql = require("sqlate")
var concat = Array.prototype.concat.bind(Array.prototype)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var {respondWithNotFound} = require("./parliament_api")
var outdent = require("root/lib/outdent")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var COMMITTEES_BY_NAME = require("root/lib/parliament_committees").ID_BY_NAME
var INITIATIVES_URL = "/api/documents/collective-addresses"
var INITIATIVE_UUID = "c5c91e62-124b-41a4-9f37-6f80f8cab5ab"
var DOCUMENT_UUID = "e519fd6f-584a-4f0e-9434-6d7c6dfe4865"
var VOLUME_UUID = "ca9c364f-25b2-4162-a9af-d4e6932d502f"
var FILE_UUID = "a8dd7913-0816-4e46-9b5a-c661a2eb97de"
var PARLIAMENT_URL = "https://www.riigikogu.ee"
var DOCUMENT_URL = PARLIAMENT_URL + "/tegevus/dokumendiregister/dokument"
var EXAMPLE_BUFFER = Buffer.from("\x0d\x25")

var job = _.compose(require("root/cli/parliament_sync_cli"), (args) => _.concat(
	"parliament-sync", args || []
))

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
		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu paremaks tegemiseks",
			created: "2015-06-18T13:37:42.666",
			submittingDate: "2015-06-17",
			sender: "John Smith",
			responsibleCommittee: [{name: "Sotsiaalkomisjon"}],

			files: [{
				uuid: FILE_UUID,
				fileName: "algatus.pdf",
				accessRestrictionType: "PUBLIC"
			}]
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
		)

		yield job()

		var initiatives = initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([new ValidInitiative({
			id: initiatives[0].id,
			uuid: INITIATIVE_UUID,
			external: true,
			created_at: new Date(2015, 5, 17),
			published_at: new Date(2015, 5, 17),
			title: "Elu paremaks tegemiseks",
			author_name: "John Smith",
			phase: "parliament",
			undersignable: false,
			parliament_uuid: INITIATIVE_UUID,
			parliament_committee: "social-affairs",
			parliament_synced_at: new Date
		})])

		eventsDb.search(sql`SELECT * FROM initiative_events`).must.be.empty()

		filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.eql([new ValidFile({
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
		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			submittingDate: "2015-06-18",
			statuses: [{date: "2015-06-20", status: {code: "MENETLUS_LOPETATUD"}}]
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		var initiative = initiativesDb.read(sql`SELECT * FROM initiatives`)

		initiative.must.eql(new ValidInitiative({
			id: initiative.id,
			uuid: INITIATIVE_UUID,
			external: true,
			created_at: new Date(2015, 5, 18),
			published_at: new Date(2015, 5, 18),
			title: "Elu Tallinnas paremaks tegemiseks",
			phase: "done",
			undersignable: false,
			finished_in_parliament_at: new Date(2015, 5, 20),
			parliament_uuid: INITIATIVE_UUID,
			parliament_synced_at: new Date
		}))
	})

	it("must strip quotes from title on an external initiative", function*() {
		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine \"Teeme Tallinna paremaks!\""
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		var initiative = initiativesDb.read(sql`
			SELECT * FROM initiatives WHERE uuid = ${INITIATIVE_UUID}
		`)

		initiative.title.must.equal("Teeme Tallinna paremaks!")
	})

	it("must strip dash from title on an external initiative", function*() {
		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine - Teeme Tallinna paremaks!"
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		var initiative = initiativesDb.read(sql`
			SELECT * FROM initiatives WHERE uuid = ${INITIATIVE_UUID}
		`)

		initiative.title.must.equal("Teeme Tallinna paremaks!")
	})

	it("must update local initiative with events and files", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: usersDb.create(new ValidUser).id,
			author_name: "John Smith",
			phase: "government"
		}))

		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			sender: "Mike Smith",
			senderReference: initiative.uuid,
			responsibleCommittee: [{name: "Sotsiaalkomisjon"}],

			statuses: [
				{date: "2018-10-23", status: {code: "REGISTREERITUD"}},
				{date: "2018-10-24", status: {code: "MENETLUSSE_VOETUD"}},
				{date: "2018-10-25", status: {code: "MENETLUS_LOPETATUD"}}
			],

			files: [{
				uuid: FILE_UUID,
				fileName: "algatus.pdf",
				accessRestrictionType: "PUBLIC"
			}]
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
		)

		yield job()

		var initiatives = initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([{
			// NOTE: Phase isn't updated if initiative not in the parliament phase.
			// Neither is the author_name.
			__proto__: initiative,
			parliament_uuid: INITIATIVE_UUID,
			parliament_committee: "social-affairs",
			parliament_synced_at: new Date,
			received_by_parliament_at: new Date(2018, 9, 23),
			accepted_by_parliament_at: new Date(2018, 9, 24),
			finished_in_parliament_at: new Date(2018, 9, 25)
		}])

		eventsDb.search(sql`SELECT * FROM initiative_events`).must.have.length(3)

		filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.eql([new ValidFile({
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
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: usersDb.create(new ValidUser).id,
			phase: "government",
			parliament_uuid: "83ecffc8-621a-4277-b388-39b1e626d1fa"
		}))

		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			senderReference: initiative.parliament_uuid,
			responsibleCommittee: [{name: "Sotsiaalkomisjon"}]
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		var initiatives = initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([{
			// NOTE: The previous parliament UUID gets updated, too.
			__proto__: initiative,
			parliament_uuid: INITIATIVE_UUID,
			parliament_committee: "social-affairs",
			parliament_synced_at: new Date
		}])
	})

	it("must update local initiative phase to done if finished", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: usersDb.create(new ValidUser).id,
			phase: "parliament",
			parliament_uuid: INITIATIVE_UUID
		}))

		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			senderReference: initiative.uuid,
			statuses: [{date: "2015-06-20", status: {code: "MENETLUS_LOPETATUD"}}]
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		var initiatives = initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([_.clone({
			__proto__: initiative,
			phase: "done",
			finished_in_parliament_at: new Date(2015, 5, 20),
			parliament_synced_at: new Date
		})])
	})

	it("must not update local initiative phase to done if finished but not in parliament phase", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: usersDb.create(new ValidUser).id,
			phase: "government",
			parliament_uuid: INITIATIVE_UUID
		}))

		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			senderReference: initiative.uuid,
			statuses: [{date: "2015-06-20", status: {code: "MENETLUS_LOPETATUD"}}]
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		var initiatives = initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([_.clone({
			__proto__: initiative,
			finished_in_parliament_at: new Date(2015, 5, 20),
			parliament_synced_at: new Date
		})])
	})

	it("must update external initiative", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			uuid: INITIATIVE_UUID,
			parliament_uuid: INITIATIVE_UUID,
			external: true,

			// NOTE: Ensure phase of an existing external initiative isn't updated as
			// it is set on the initial import.
			phase: "government",
			destination: "parliament"
		}))

		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu paremaks tegemiseks",
			sender: "John Smith",

			statuses: [
				{date: "2018-10-23", status: {code: "REGISTREERITUD"}},
				{date: "2018-10-24", status: {code: "MENETLUSSE_VOETUD"}},
				{date: "2018-10-25", status: {code: "MENETLUS_LOPETATUD"}}
			]
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		var initiatives = initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([{
			__proto__: initiative,
			parliament_uuid: INITIATIVE_UUID,
			parliament_synced_at: new Date,
			received_by_parliament_at: new Date(2018, 9, 23),
			accepted_by_parliament_at: new Date(2018, 9, 24),
			finished_in_parliament_at: new Date(2018, 9, 25)
		}])
	})

	it("must not download non-public files", function*() {
		var initiativeDoc = {
			uuid: INITIATIVE_UUID,

			files: [{
				uuid: FILE_UUID,
				fileName: "Pöördumise allkirjade register _30_10_2018.xlsx",
				accessRestrictionType: "FOR_USE_WITHIN_ESTABLISHMENT",
			}]
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		filesDb.search(sql`SELECT * FROM initiative_files`).must.be.empty()
	})

	it("must ignore if initiative not updated", function*() {
		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			title: "Teeme elu paremaks!"
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respondOnce(initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respondMany([initiativeDoc, initiativeDoc])
		)

		yield job()
		var initiative = initiativesDb.read(sql`SELECT * FROM initiatives`)
		this.time.tick(60 * 1000)

		yield job()
		initiativesDb.read(initiative).must.eql(initiative)
	})

	// It seems to be the case as of Jul 19, 2019 and still as of Dec, 2023
	// that the statuses array is sorted randomly on every response. Same for
	// relatedDocuments and relatedVolumes.
	it("must ignore update if arrays shuffled", function*() {
		var documents = [{uuid: newUuid()}, {uuid: newUuid()}, {uuid: newUuid()}]
		var volumes = [{uuid: newUuid()}, {uuid: newUuid()}, {uuid: newUuid()}]
		var files = [{uuid: newUuid()}, {uuid: newUuid()}, {uuid: newUuid()}]

		files.forEach((file) => (
			file.accessRestrictionType = "FOR_USE_WITHIN_ESTABLISHMENT"
		))

		var a = {
			uuid: INITIATIVE_UUID,
			files,
			relatedDocuments: documents,
			relatedVolumes: volumes,

			statuses: [
				// Note the test with two statuses on the same date, too.
				{
					date: "2018-10-24",
					status: {code: "REGISTREERITUD", relatedDocuments: documents}
				},

				{
					date: "2018-10-24",
					status: {code: "MENETLUSSE_VOETUD", relatedVolumes: volumes},
				},

				{date: "2018-10-25", status: {code: "MENETLUS_LOPETATUD"}}
			]
		}

		var b = _.defaults({
			files: _.shuffle(a.files),

			statuses: _.shuffle(a.statuses).map((status) => _.defaults({
				relatedDocuments: _.shuffle(status.relatedDocuments || []),
				relatedVolumes: _.shuffle(status.relatedVolumes || [])
			}, status)),

			relatedDocuments: _.shuffle(a.relatedDocuments),
			relatedVolumes: _.shuffle(a.relatedVolumes)
		}, a)

		this.router.get(INITIATIVES_URL, respondMany([[a], [b]]))
		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respondOnce(a))

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respondMany([a, b])
		)

		documents.forEach((doc) => (
			this.router.get(`/api/documents/${doc.uuid}`, respondOnce(doc))
		))

		volumes.forEach((volume) => (
			this.router.get(`/api/volumes/${volume.uuid}`, respondOnce(volume))
		))

		yield job()
		var initiative = initiativesDb.read(sql`SELECT * FROM initiatives`)
		this.time.tick(60 * 1000)

		yield job()
		initiativesDb.read(initiative).must.eql(initiative)
	})

	it("must ignore update if collection response misses file accessRestrictionHistory", function*() {
		var fileUuid = newUuid()

		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID,
			files: [{uuid: fileUuid}],
		}]))

		var initiativeDoc = {
			uuid: INITIATIVE_UUID,

			files: [{
				uuid: fileUuid,
				accessRestrictionHistory: [{
					changeReason: {code: "PIIRANG_KEHTETUKS_TUNNISTATUD"}
				}]
			}],
		}

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respondOnce(initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respondMany([initiativeDoc, initiativeDoc])
		)

		yield job()
		var initiative = initiativesDb.read(sql`SELECT * FROM initiatives`)
		this.time.tick(60 * 1000)

		yield job()
		initiativesDb.read(initiative).must.eql(initiative)
	})

	// The /collective-addresses endpoint lacks `relatedDocuments` for _some_
	// initiatives. For some, it includes them.
	// https://github.com/riigikogu-kantselei/api/issues/34.
	it("must ignore update if collection response misses relatedDocuments", function*() {
		this.router.get(INITIATIVES_URL, respond.bind(null, [{
			uuid: INITIATIVE_UUID
		}]))

		var documents = [{uuid: newUuid()}, {uuid: newUuid()}, {uuid: newUuid()}]
		var initiativeDoc = {uuid: INITIATIVE_UUID, relatedDocuments: documents}

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respondOnce(initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respondMany([
				initiativeDoc,

				_.defaults({
					relatedDocuments: _.shuffle(initiativeDoc.relatedDocuments),
				}, initiativeDoc)
			])
		)

		documents.forEach((doc) => (
			this.router.get(`/api/documents/${doc.uuid}`, respondOnce(doc))
		))

		yield job()
		var initiative = initiativesDb.read(sql`SELECT * FROM initiatives`)
		this.time.tick(60 * 1000)

		yield job()
		initiativesDb.read(initiative).must.eql(initiative)
	})

	it("must email subscribers interested in events", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			uuid: INITIATIVE_UUID,
			phase: "parliament",
			parliament_uuid: INITIATIVE_UUID,
			title: "Teeme elu paremaks!",
			external: true
		}))

		subscriptionsDb.create([
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
				initiative_destination: "tallinn",
				confirmed_at: new Date,
				event_interest: true
			})
		])

		var subscriptions = subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date,
				event_interest: true
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date,
				event_interest: true
			}),

			new ValidSubscription({
				initiative_destination: initiative.destination,
				confirmed_at: new Date,
				event_interest: true
			})
		])

		var eventDates = _.times(3, (i) => DateFns.addDays(new Date, i + -5))

		var initiativeDoc = {
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
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		var messages = messagesDb.search(sql`SELECT * FROM initiative_messages`)
		var emails = subscriptions.map((s) => s.email).sort()

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
		var email = this.emails[0]
		email.envelope.to.must.eql(emails)

		email.headers.subject.must.equal(
			t("INITIATIVE_PARLIAMENT_EVENT_MESSAGE_TITLE", {
				initiativeTitle: initiative.title,
				eventDate: formatDate("numeric", eventDates[2])
			})
		)

		email.body.must.equal(
			renderEmail("INITIATIVE_PARLIAMENT_EVENT_MESSAGE_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				eventsUrl: `${Config.url}/initiatives/${initiative.uuid}#events`,
				unsubscribeUrl: `${Config.url}%recipient.unsubscribeUrl%`,

				eventTitles: outdent`
					${formatDate("numeric", eventDates[0])} — ${t("PARLIAMENT_RECEIVED")}
					${formatDate("numeric", eventDates[1])} — ${t("PARLIAMENT_ACCEPTED")}
					${formatDate("numeric", eventDates[2])} — ${t("PARLIAMENT_FINISHED")}
				`
			})
		)

		JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
			serializeMailgunVariables(subscriptions)
		)
	})

	it("must not email subscribers if event occurred earlier than 3 months",
		function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			title: "Teeme elu paremaks!",
			uuid: INITIATIVE_UUID,
			phase: "parliament",
			parliament_uuid: INITIATIVE_UUID,
			external: true
		}))

		var subscription = subscriptionsDb.create(new ValidSubscription({
			initiative_uuid: null,
			confirmed_at: new Date,
			event_interest: true
		}))

		var threshold = DateFns.addMonths(new Date, -3)

		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			statuses: [{
				date: formatDate("iso", DateFns.addDays(threshold, -1)),
				status: {code: "MENETLUSSE_VOETUD"}
			}, {
				date: formatDate("iso", threshold),
				status: {code: "MENETLUS_LOPETATUD"}
			}]
		}
		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		var message = messagesDb.read(sql`SELECT * FROM initiative_messages`)

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
		var initiative = initiativesDb.create(new ValidInitiative({
			uuid: INITIATIVE_UUID,
			parliament_uuid: INITIATIVE_UUID,
			phase: "parliament",
			external: true
		}))

		eventsDb.create(new ValidEvent({
			initiative_uuid: initiative.uuid,
			external_id: "REGISTREERITUD",
			origin: "parliament",
			type: "parliament-received"
		}))

		subscriptionsDb.create(new ValidSubscription({
			confirmed_at: new Date,
			event_interest: true
		}))

		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			statuses: [{date: "2018-10-23", status: {code: "REGISTREERITUD"}}]
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()
		this.emails.length.must.equal(0)
	})

	_.map(COMMITTEES_BY_NAME, function(id, name) {
		it(`must update the initiative given ${name}`, function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: usersDb.create(new ValidUser).id,
				parliament_uuid: INITIATIVE_UUID,
				phase: "parliament"
			}))

			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				responsibleCommittee: [{name}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			yield job()

			initiative = initiativesDb.read(initiative)
			initiative.parliament_committee.must.equal(id)
		})
	})

	it("must update the initiative given multiple committees", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: usersDb.create(new ValidUser).id,
			parliament_uuid: INITIATIVE_UUID,
			phase: "parliament"
		}))

		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			responsibleCommittee: [
				{name: "Kultuurikomisjon"},
				{name: "Sotsiaalkomisjon", active: true},
				{name: "Majanduskomisjon"}
			]
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		initiative = initiativesDb.read(initiative)
		initiative.parliament_committee.must.equal("social-affairs")
	})

	it("must update the initiative given multiple committees with no active",
		function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: usersDb.create(new ValidUser).id,
			parliament_uuid: INITIATIVE_UUID,
			phase: "parliament"
		}))

		var initiativeDoc = {
			uuid: INITIATIVE_UUID,
			responsibleCommittee: [
				{name: "Kultuurikomisjon"},
				{name: "Sotsiaalkomisjon"},
				{name: "Majanduskomisjon"}
			]
		}

		this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

		this.router.get(
			`/api/documents/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		this.router.get(
			`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
			respond.bind(null, initiativeDoc)
		)

		yield job()

		initiative = initiativesDb.read(initiative)
		initiative.parliament_committee.must.equal("economic-affairs")
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
				parliament_committee: "social-affairs",
				accepted_by_parliament_at: new Date(2018, 9, 24)
			}, {
				occurred_at: new Date(2018, 9, 24),
				origin: "parliament",
				external_id: "MENETLUSSE_VOETUD",
				type: "parliament-accepted",
				title: null,
				content: {committee: "social-affairs"},
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
				parliament_committee: "social-affairs"
			}, {
				occurred_at: new Date(2018, 9, 24),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2018-10-24",
				type: "parliament-committee-meeting",
				title: null,

				content: {
					committee: "social-affairs",
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
		}, function([api, attrs, eventAttrs], title) {
			it(`must create events given ${title}`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					parliament_uuid: INITIATIVE_UUID
				}))

				var initiativeDoc = _.defaults({uuid: INITIATIVE_UUID}, api)

				this.router.get(INITIATIVES_URL,	respond.bind(null, [initiativeDoc]))

				this.router.get(
					`/api/documents/${INITIATIVE_UUID}`,
					respond.bind(null, initiativeDoc)
				)

				this.router.get(
					`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
					respond.bind(null, initiativeDoc)
				)

				yield job()

				var updated = initiativesDb.read(initiative)

				updated.must.eql(_.assign({
					__proto__: initiative,
					parliament_synced_at: new Date
				}, attrs))

				var events = eventsDb.search(sql`SELECT * FROM initiative_events`)
				events.must.eql(concat(eventAttrs).map((attrs, i) => new ValidEvent({
					__proto__: attrs,
					id: i + 1,
					initiative_uuid: initiative.uuid
				})))
			})
		})

		it("must create events given status with related documents", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: usersDb.create(new ValidUser).id,
				parliament_uuid: INITIATIVE_UUID
			}))

			var initiativeDoc = {
				uuid: INITIATIVE_UUID,

				statuses: [{
					date: "2015-06-17",
					status: {code: "MENETLUSSE_VOETUD"},
					relatedDocuments: [{uuid: DOCUMENT_UUID}]
				}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			var updatedInitiative = initiativesDb.read(initiative)
			updatedInitiative.must.eql(_.assign({}, initiative, {
				accepted_by_parliament_at: new Date(2015, 5, 17),
				parliament_synced_at: new Date
			}))

			eventsDb.search(sql`
				SELECT * FROM initiative_events
			`).must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: initiative.uuid,
				occurred_at: new Date(2015, 5, 17),
				origin: "parliament",
				external_id: "MENETLUSSE_VOETUD",
				type: "parliament-accepted",
				title: null,
				content: {committee: null}
			})])

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: usersDb.create(new ValidUser).id,
				parliament_uuid: INITIATIVE_UUID
			}))

			var initiativeDoc = {
				uuid: INITIATIVE_UUID,

				statuses: [{
					date: "2015-06-20",
					status: {code: "ARUTELU_KOMISJONIS"},
					relatedDocuments: [{uuid: DOCUMENT_UUID}]
				}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			var updatedInitiative = initiativesDb.read(initiative)
			updatedInitiative.must.eql(_.assign({}, initiative, {
				parliament_synced_at: new Date
			}))

			eventsDb.search(sql`
				SELECT * FROM initiative_events
			`).must.eql([new ValidEvent({
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

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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
			var a = {
				uuid: INITIATIVE_UUID,
				responsibleCommittee: [{name: "Sotsiaalkomisjon"}],
				statuses: [{date: "2015-06-18", status: {code: "MENETLUSSE_VOETUD"}}]
			}

			var b = {
				uuid: INITIATIVE_UUID,
				responsibleCommittee: [{name: "Majanduskomisjon"}],
				statuses: [{date: "2015-06-18", status: {code: "MENETLUSSE_VOETUD"}}]
			}

			this.router.get(INITIATIVES_URL, respondMany([[a], [b]]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respondMany([a, b])
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respondMany([a, b])
			)

			yield job()

			var event = eventsDb.read(sql`SELECT * FROM initiative_events`)
			yield job()
			eventsDb.read(event).must.eql(event)
		})

		it("must update committee meeting event", function*() {
			var a = {
				uuid: INITIATIVE_UUID,
				responsibleCommittee: [{name: "Sotsiaalkomisjon"}],
				statuses: [{
					date: "2018-10-24",
					status: {code: "ARUTELU_KOMISJONIS"},
					committeeDecision: {code: "JATKATA_ARUTELU"}
				}]
			}

			var b = {
				uuid: INITIATIVE_UUID,
				responsibleCommittee: [{name: "Majanduskomisjon"}],
				statuses: [{
					date: "2018-10-24",
					status: {code: "ARUTELU_KOMISJONIS"},
					committeeDecision: {code: "ETTEPANEK_INSTITUTSIOONILE"}
				}]
			}

			this.router.get(INITIATIVES_URL, respondMany([[a], [b]]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respondMany([a, b])
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respondMany([a, b])
			)

			yield job()

			var event = eventsDb.read(sql`SELECT * FROM initiative_events`)

			event = eventsDb.update(event, {
				type: event.type,
				content: _.assign(event.content, {summary: "It was a good meeting."})
			})

			yield job()

			eventsDb.read(event).must.eql({
				__proto__: event,
				content: {
					committee: "social-affairs",
					invitees: null,
					links: [],
					decision: "forward",
					summary: "It was a good meeting."
				}
			})
		})

		it("must update committee meeting event files", function*() {
			var a = {
				uuid: INITIATIVE_UUID,
				statuses: [{
					date: "2018-10-24",
					status: {code: "ARUTELU_KOMISJONIS"},
					relatedDocuments: [{uuid: DOCUMENT_UUID}]
				}]
			}

			// Update something in the initiative to get past the initial diff.
			var b = {
				title: "Updated title",
				uuid: INITIATIVE_UUID,

				statuses: [{
					date: "2018-10-24",
					status: {code: "ARUTELU_KOMISJONIS"},
					relatedDocuments: [{uuid: DOCUMENT_UUID}]
				}]
			}

			this.router.get(INITIATIVES_URL, respondMany([[a], [b]]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respondMany([a, b])
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respondMany([a, b])
			)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respondMany([{
				uuid: DOCUMENT_UUID,
				title: "Protokoll",
				documentType: "protokoll",
				files: []
			}, {
				uuid: DOCUMENT_UUID,
				title: "Protokoll",
				documentType: "protokoll",

				files: [{
					uuid: FILE_UUID,
					fileName: "Protokoll.pdf",
					accessRestrictionType: "PUBLIC"
				}]
			}]))

			this.router.get(`/download/${FILE_UUID}`,
				respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
			)

			yield job()
			var event = eventsDb.read(sql`SELECT * FROM initiative_events`)
			yield job()

			eventsDb.read(event).must.eql(event)

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
				id: 1,
				event_id: 1,
				initiative_uuid: event.initiative_uuid,
				external_id: FILE_UUID,
				name: "Protokoll.pdf",
				title: "Protokoll",
				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: Buffer.from("PDF"),
				content_type: new MediaType("application/pdf"),
				external_url: PARLIAMENT_URL + "/download/" + FILE_UUID
			})])
		})

		it("must update decision", function*() {
			var a = {
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{
					uuid: DOCUMENT_UUID,
					documentType: "decisionDocument",
					title: "A"
				}]
			}

			// Use an updated title as a way to force refetching of related
			// documents.
			var b = {
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{
					uuid: DOCUMENT_UUID,
					documentType: "decisionDocument",
					title: "B"
				}]
			}

			this.router.get(INITIATIVES_URL, respondMany([[a], [b]]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respondMany([a, b])
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respondMany([a, b])
			)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respondMany([{
				uuid: DOCUMENT_UUID,
				title: "Otsuse muutmine",
				documentType: "decisionDocument",
				created: "2015-06-18T13:37:42.666"
			}, {
				uuid: DOCUMENT_UUID,
				title: "Otsuse muutmine (uuendatud)",
				documentType: "decisionDocument",
				created: "2015-06-18T15:37:42.666"
			}]))

			yield job()

			var event = eventsDb.read(sql`SELECT * FROM initiative_events`)

			event = eventsDb.update(event, {
				type: event.type,
				content: _.assign(event.content, {summary: "An important decision"})
			})

			yield job()

			eventsDb.read(event).must.eql({
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
				var a = {
					uuid: INITIATIVE_UUID,
					statuses: [{date: "2015-06-18", status: {code: code}}]
				}

				// Update something in the initiative to get past the initial diff.
				var b = {
					title: "Updated title",
					uuid: INITIATIVE_UUID,
					statuses: [{date: "2015-06-18", status: {code: code}}]
				}

				this.router.get(INITIATIVES_URL, respondMany([[a], [b]]))

				this.router.get(
					`/api/documents/${INITIATIVE_UUID}`,
					respondMany([a, b])
				)

				this.router.get(
					`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
					respondMany([a, b])
				)

				yield job()

				var initiative = initiativesDb.read(sql`SELECT * FROM initiatives`)

				var events = eventsDb.search(sql`SELECT * FROM initiative_events`)
				events.length.must.equal(1)

				this.time.tick(1000)
				yield job()

				initiativesDb.read(sql`
					SELECT * FROM initiatives
				`).must.eql(_.defaults({parliament_synced_at: new Date}, initiative))

				eventsDb.search(sql`
					SELECT * FROM initiative_events
				`).must.eql(events)
			})
		})

		// While supposedly a data error and fixed in the parliament APi response as
		// of Jul 12, 2019, keep the test around to ensure proper handling of future
		// duplicates.
		//
		// https://github.com/riigikogu-kantselei/api/issues/17
		it("must ignore duplicate REGISTREERITUD statuses", function*() {
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,

				statuses: [
					{date: "2018-10-24", status: {code: "REGISTREERITUD"}},
					{date: "2018-10-24", status: {code: "REGISTREERITUD"}}
				]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			yield job()

			var initiative = initiativesDb.read(sql`SELECT * FROM initiatives`)

			initiative.must.eql(new ValidInitiative({
				__proto__: initiative,
				uuid: INITIATIVE_UUID,
				received_by_parliament_at: new Date(2018, 9, 24),
				parliament_uuid: INITIATIVE_UUID,
				parliament_synced_at: new Date
			}))

			eventsDb.search(sql`SELECT * FROM initiative_events`).length.must.equal(1)
		})
	})

	describe("given volume", function() {
		it("must create events when in a volume of letters, with letters", function*() {
			// NOTE: Initiative volume is missing on the collective-addresses
			// collection response.
			var initiativeDoc = {uuid: INITIATIVE_UUID}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null,
				_.defaults({volume: {uuid: VOLUME_UUID}}, initiativeDoc)
			))

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			var events = eventsDb.search(sql`SELECT * FROM initiative_events`)

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

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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
			var initiativeDoc = {uuid: INITIATIVE_UUID}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null,
				_.defaults({volume: {uuid: VOLUME_UUID}}, initiativeDoc)
			))

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			var events = eventsDb.search(sql`SELECT * FROM initiative_events`)

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

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: usersDb.create(new ValidUser).id,
				parliament_uuid: INITIATIVE_UUID
			}))

			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			var updatedInitiative = initiativesDb.read(initiative)
			updatedInitiative.must.eql(_.assign({}, initiative, {
				finished_in_parliament_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				parliament_synced_at: new Date
			}))

			eventsDb.search(sql`
				SELECT * FROM initiative_events
			`).must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: initiative.uuid,
				occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				origin: "parliament",
				external_id: "MENETLUS_LOPETATUD",
				type: "parliament-finished",
				title: null,
				content: null
			})])

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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
				content: {committee: "environment", invitees: null}
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
				content: {committee: "environment", invitees: null}
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

			"committee meeting protocol with date and time with periods": [{
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}, {
				[DOCUMENT_UUID]: {
					uuid: DOCUMENT_UUID,
					title: "Protokoll",
					documentType: "protokoll",

					volume: {
						uuid: VOLUME_UUID,
						reference: "1-3/KEKK/3-7",
						title: "Komisjoni istung teisipäev, 18.06.2015 13.37",
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
				content: {committee: "environment", invitees: null}
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
				content: {committee: "environment", invitees: null}
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
				content: {committee: "environment"}
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
				content: {committee: "environment"}
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
				content: {committee: "environment"}
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
				content: {committee: "environment", invitees: null, links: []}
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

			// Ensures the latest committee from the initiative is not used in
			// situations where we have the protocol.
			"ARUTELU_KOMISJONIS status and joint committee meeting protocol": [{
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
						reference: "1-3/YHIS/3-7",
						title: "Komisjonide ühisistung teisipäev, 18.06.2015 13:37",
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
					committee: null,
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
		}, function([api, documents, eventAttrs, files], title) {
			it(`must create events and files given ${title}`,
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					parliament_uuid: INITIATIVE_UUID
				}))
				var initiativeDoc = _.defaults({uuid: INITIATIVE_UUID}, api)

				this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

				this.router.get(
					`/api/documents/${INITIATIVE_UUID}`,
					respond.bind(null, initiativeDoc)
				)

				this.router.get(
					`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
					respond.bind(null, initiativeDoc)
				)

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

				var events = eventsDb.search(sql`SELECT * FROM initiative_events`)

				events.must.eql(concat(eventAttrs).map((attrs, i) => new ValidEvent({
					__proto__: attrs,
					id: i + 1,
					initiative_uuid: initiative.uuid
				})))

				filesDb.search(sql`
					SELECT * FROM initiative_files
				`).must.eql(files.map((file) => new ValidFile({
					__proto__: file,
					initiative_uuid: initiative.uuid,
					external_url: PARLIAMENT_URL + "/download/" + file.external_id
				})))
			})
		})

		it("must download only public files", function*() {
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
				id: 1,
				event_id: 1,
				initiative_uuid: INITIATIVE_UUID,
				external_id: "005e0726-0886-4bc9-ad3a-f900f0173cf7",
				name: "Kollektiivse_pöördumise_menetlusse_võtmine.asice",
				title: "Kollektiivse pöördumise menetlusse võtmine",

				external_url:
					PARLIAMENT_URL + "/download/005e0726-0886-4bc9-ad3a-f900f0173cf7",

				url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
				content: Buffer.from("ASICE"),
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

				content: Buffer.from("PDF"),
				content_type: new MediaType("application/pdf")
			})])
		})

		it("must use related document file title if available", function*() {
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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

		// https://www.riigikogu.ee/riigikogu/riigikogu-komisjonid
		// https://www.riigikogu.ee/riigikogu/koosseis/muudatused-koosseisus/
		_.each({
			ELAK: "eu-affairs",
			KEKK: "environment",
			KULK: "cultural-affairs",
			MAEK: "rural-affairs",
			MAJK: "economic-affairs",
			PÕSK: "constitutional",
			RAHK: "finance",
			RIKK: "national-defence",
			SOTK: "social-affairs",
			VÄLK: "foreign-affairs",
			ÕIGK: "legal-affairs",
			KVEK: "anti-corruption",
			REKK: "state-budget-control",
			JAJK: "security-authorities-surveillance"
		}, function(name, code) {
			it("must create event given committee meeting protocol of " + code, function*() {
				var initiativeDoc = {
					uuid: INITIATIVE_UUID,
					relatedDocuments: [{uuid: DOCUMENT_UUID}]
				}

				this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

				this.router.get(
					`/api/documents/${INITIATIVE_UUID}`,
					respond.bind(null, initiativeDoc)
				)

				this.router.get(
					`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
					respond.bind(null, initiativeDoc)
				)

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

				var events = eventsDb.search(sql`SELECT * FROM initiative_events`)

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

				filesDb.search(sql`
					SELECT * FROM initiative_files
				`).must.eql([new ValidFile({
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
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Secret meeting",
				documentType: "protokoll",

				volume: {
					uuid: VOLUME_UUID,
					reference: `1-3/LEET/3-7`,
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

			eventsDb.search(sql`SELECT * FROM initiative_events`).must.be.empty()
			filesDb.search(sql`SELECT * FROM initiative_files`).must.be.empty()
		})

		it("must not create event given letter with no public files", function*() {
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			eventsDb.search(sql`SELECT * FROM initiative_events`).must.be.empty()
			filesDb.search(sql`SELECT * FROM initiative_files`).must.be.empty()
		})

		// There's another test elsewhere that tests given an agenda item *with*
		// a volume.
		it("must create event given a document representing an agenda item without related volume", function*() {
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			var events = eventsDb.search(sql`SELECT * FROM initiative_events`)

			events.must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				occurred_at: new Date(2015, 5, 18, 13, 37),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
				type: "parliament-committee-meeting",
				title: null,

				content: {
					committee: "social-affairs",
					invitees: "Sotsiaalministeeriumi terviseala asekantsler"
				}
			})])

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "OTRK: Important",
				created: "2015-06-18T13:37:42.666",
				documentType: "otherQuestionDocument",
				subType: {code: "OLULISE_TAHTSUSEGA_RIIKLIK_KUSIMUS"},
				respondDate: "2015-06-27",

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

			var events = eventsDb.search(sql`SELECT * FROM initiative_events`)

			events.must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				occurred_at: new Date(2015, 5, 27),
				origin: "parliament",
				external_id: DOCUMENT_UUID,
				type: "parliament-national-matter",
				title: null,
				content: {}
			})])

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,

				relatedDocuments: [{
					uuid: DOCUMENT_UUID,
					documentType: "unitAgendaItemDocument"
				}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,

				relatedDocuments: [{
					uuid: DOCUMENT_UUID,
					documentType: "opinionDocument"
				}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/${DOCUMENT_UUID}`,
				respondWithNotFound.bind(null, INITIATIVE_UUID)
			)

			yield job()
		})

		it("must not ignore other unavailable documents", function*() {
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,

				relatedDocuments: [{
					uuid: DOCUMENT_UUID,
					documentType: "decisionDocument"
				}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				relatedVolumes: [{uuid: VOLUME_UUID}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			var events = eventsDb.search(sql`SELECT * FROM initiative_events`)

			events.must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				occurred_at: new Date(2015, 5, 18, 13, 37),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
				type: "parliament-committee-meeting",
				title: null,
				content: {committee: "environment", invitees: null}
			})])

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				relatedDocuments: [{uuid: DOCUMENT_UUID}],
				relatedVolumes: [{uuid: VOLUME_UUID}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			var events = eventsDb.search(sql`SELECT * FROM initiative_events`)

			events.must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				occurred_at: new Date(2015, 5, 18, 13, 37),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
				type: "parliament-committee-meeting",
				title: null,

				content: {
					committee: "social-affairs",
					invitees: "Sotsiaalministeeriumi terviseala asekantsler"
				}
			})])

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,

				statuses: [
					{date: "2015-06-18", status: {code: "ARUTELU_KOMISJONIS"}}
				],

				relatedVolumes: [{
					uuid: VOLUME_UUID,
					title: "Komisjoni istung esmaspäev, 18.06.2015 13:37",
					volumeType: "unitSittingVolume"
				}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			var events = eventsDb.search(sql`SELECT * FROM initiative_events`)

			events.must.eql([new ValidEvent({
				id: 1,
				initiative_uuid: INITIATIVE_UUID,
				occurred_at: new Date(2015, 5, 18, 13, 37),
				origin: "parliament",
				external_id: "ARUTELU_KOMISJONIS/2015-06-18",
				type: "parliament-committee-meeting",
				title: null,
				content: {committee: "environment", invitees: null, links: []}
			})])

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				relatedVolumes: [{uuid: VOLUME_UUID}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

			var events = eventsDb.search(sql`SELECT * FROM initiative_events`)

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

			filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.eql([new ValidFile({
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
			var initiativeDoc = {
				uuid: INITIATIVE_UUID,
				relatedVolumes: [{uuid: VOLUME_UUID, volumeType: "eelnou"}]
			}

			this.router.get(INITIATIVES_URL, respond.bind(null, [initiativeDoc]))

			this.router.get(
				`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

			this.router.get(
				`/api/documents/collective-addresses/${INITIATIVE_UUID}`,
				respond.bind(null, initiativeDoc)
			)

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

function respondOnce(body) {
	var requested = 0

	return function(req, res) {
		if (++requested <= 1) return void respond(body, req, res)
		res.statusCode = 500
		res.statusMessage = "Requested More Than Once: " + req.url
		res.end()
	}
}

function respondMany(bodies) {
	return function(req, res) {
		if (bodies.length > 0) return void respond(bodies.shift(), req, res)
		res.statusCode = 500
		res.statusMessage = "Out of Body Experience"
		res.end()
	}
}

function respondWithRiigikoguDownload(contentType, content, req, res) {
	// https://riigikogu.ee redirects to https://www.riigikogu.ee.
	req.headers.host.must.equal("www.riigikogu.ee")
	res.setHeader("Content-Type", contentType)
	res.end(content)
}

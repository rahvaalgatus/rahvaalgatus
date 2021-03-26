var _ = require("root/lib/underscore")
var Neodoc = require("neodoc")
var Time = require("root/lib/time")
var DateFns = require("date-fns")
var Config = require("root/config")
var Subscription = require("root/lib/subscription")
var FetchError = require("fetch-error")
var parliamentApi = require("root/lib/parliament_api")
var diff = require("root/lib/diff")
var sql = require("sqlate")
var initiativesDb = require("root/db/initiatives_db")
var eventsDb = require("root/db/initiative_events_db")
var filesDb = require("root/db/initiative_files_db")
var messagesDb = require("root/db/initiative_messages_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var concat = Array.prototype.concat.bind(Array.prototype)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var renderEventTitle = require("root/lib/event").renderEventTitle
var t = require("root/lib/i18n").t.bind(null, "et")
var formatDate = require("root/lib/i18n").formatDate.bind(null, "numeric")
var formatIsoDate = require("root/lib/i18n").formatDate.bind(null, "iso")
var logger = require("root").logger
var EMPTY_ARR = Array.prototype
var PARLIAMENT_URL = "https://www.riigikogu.ee"
var DOCUMENT_URL = PARLIAMENT_URL + "/tegevus/dokumendiregister/dokument"
var FILE_URL = PARLIAMENT_URL + "/download"
exports = module.exports = cli
exports.parseTitle = parseTitle
exports.replaceInitiative = replaceInitiative
exports.syncInitiativeDocuments = syncInitiativeDocuments
exports.readVolumeWithDocuments = readVolumeWithDocuments

var USAGE_TEXT = `
Usage: cli parliament-sync (-h | --help)
       cli parliament-sync [options] [<uuid>]

Options:
    -h, --help   Display this help and exit.
    --force      Force refreshing initiatives from the parliament API.
    --cached     Do not refresh initiatives from the parliament API.
    --quiet      Do not report ignored initiatives and documents.
`

function* cli(argv) {
  var args = Neodoc.run(USAGE_TEXT, {argv: argv || ["parliament-sync"]})
  if (args["--help"]) return void process.stdout.write(USAGE_TEXT.trimLeft())

	var uuid = args["<uuid>"]
	if (uuid == "") throw new Error("Invalid UUID: " + uuid)

	var opts = {quiet: args["--quiet"]}

	if (args["--cached"]) {
		var initiatives = yield initiativesDb.search(sql`
			SELECT * FROM initiatives
			WHERE parliament_api_data IS NOT NULL
			${uuid ? sql`AND uuid = ${uuid}` : sql``}
		`)

		yield initiatives.map((i) => (
			replaceInitiative(opts, i, i.parliament_api_data)
		))
	}
	else yield sync(_.defaults({force: args["--force"]}, opts), uuid)
}

function* sync(opts, uuid) {
	var api = _.memoize(parliamentApi)
	var force = opts.force

	var docs = yield (uuid == null
		? api("documents/collective-addresses").then(getBody)
		: api(`documents/collective-addresses/${uuid}`).then(getBody).then(concat)
	)

	var pairs = _.zip(yield docs.map(readInitiative.bind(null, opts)), docs)
	pairs = pairs.filter(_.compose(Boolean, _.first))

	pairs = yield pairs.map(function*([initiative, initiativeDoc]) {
		// Because the collective-addresses/:id endpoint doesn't return files
		// (https://github.com/riigikogu-kantselei/api/issues/27), we used to
		// populate files only on the first run and later switched to use
		// a cached response on the assumption that no new files will appear after
		// creation.
		//
		// A change made in the summer of 2020, however, broke the relatedDocuments
		// attribute in the collective-addresses response, making it necessary to
		// always load the parent document.
		// https://github.com/riigikogu-kantselei/api/issues/33
		var doc = yield api("documents/" + initiativeDoc.uuid).then(getBody)

		initiativeDoc.volume = doc.volume || null
		initiativeDoc.files = doc.files || null

		if (doc.relatedDocuments)
			initiativeDoc.relatedDocuments = doc.relatedDocuments
		if (doc.relatedVolumes)
			initiativeDoc.relatedVolumes = doc.relatedVolumes

		return [initiative, initiativeDoc]
	})

	var updated = pairs.filter(function(initiativeAndDocument) {
		var initiative = initiativeAndDocument[0]
		var document = initiativeAndDocument[1]

		return initiative.parliament_api_data == null || force || diff(
			normalizeParliamentDocumentForDiff(initiative.parliament_api_data),
			normalizeParliamentDocumentForDiff(document)
		)
	})

	yield updated.map(function*(initiativeAndDocument) {
		var initiative = initiativeAndDocument[0]

		var doc = yield syncInitiativeDocuments(api, initiativeAndDocument[1])
		initiative = yield replaceInitiative(opts, initiative, doc)

		yield initiativesDb.update(initiative, {
			parliament_api_data: doc,
			parliament_synced_at: new Date
		})
	})
}

function* readInitiative(opts, doc) {
	var initiative

	// Around April 2020 old initiatives in the parliament API were recreated and
	// their old UUIDs were assigned to the `senderReference` field.
	// Unfortunately previous Rahvaalgatus' UUIDs (in `senderReference`) were
	// therefore overwritten  from `senderReference` making it impossible to
	// identify sent initiatives if you already don't have the previous parliament
	// UUID. Waiting for an update on that as of Apr 17, 2020.
	if (initiative = yield initiativesDb.read(sql`
		SELECT * FROM initiatives
		WHERE uuid = ${doc.senderReference}
		OR parliament_uuid = ${doc.uuid}
		OR parliament_uuid = ${doc.senderReference}
		LIMIT 1
	`)) return initiative

	// Use submittedDate as some initiatives documents were recreated
	// 5 years after the actual submitting date. Example:
	// https://api.riigikogu.ee/api/documents/collective-addresses/b9a5b10c-3744-49bc-b4f4-cecf34721b1f
	//
	// TODO: Ensure time parsing is always in Europe/Tallinn and don't depend
	// on TZ being set.
	// https://github.com/riigikogu-kantselei/api/issues/11
	var createdAt = (
		doc.submittingDate && Time.parseIsoDate(doc.submittingDate) ||
		doc.created && Time.parseIsoDateTime(doc.created) ||
		new Date
	)

	if (!Config.importInitiativesFromParliament) {
		if (!opts.quiet)
			logger.log("Ignoring new initiative %s (%s)…", doc.uuid, doc.title)

		return null
	}
	else return {
		parliament_uuid: doc.uuid,
		external: true,
		phase: "parliament",
		destination: "parliament",
		title: doc.title ? parseTitle(doc.title) : "",
		author_name: doc.sender || "",
		created_at: createdAt,
		published_at: createdAt
	}
}

function* syncInitiativeDocuments(api, doc) {
	if (doc.volume) {
		doc.volume = yield readVolumeWithDocuments(api, doc.volume.uuid)

		// The document we're syncing could either be one from
		// /documents/collective-addresses or from /documents, so
		// _.without(volume.documents, doc) won't cut it.
		doc.volume.documents = _.reject(doc.volume.documents, (d) => (
			d.uuid == doc.uuid
		))
	}

	// Note we need to fetch the initiative as a document, too, as the
	// /collective-addresses response doesn't include documents' volumes.
	//
	// Don't then fetch all volumes for all documents as some of them include
	// documents unrelated to the initiative. For example, an initiative
	// acceptance decision (https://api.riigikogu.ee/api/documents/d655bc48-e5ec-43ad-9640-8cba05f78427)
	// resides in a "All parliament decisions in 2019" volume.
	doc.relatedDocuments = (
		yield (doc.relatedDocuments || []).map(readDocument)
	).filter(Boolean)

	doc.relatedVolumes = yield (doc.relatedVolumes || []).map(getUuid).map(
		readVolumeWithDocuments.bind(null, api)
	)

	var relatedVolumeUuids = new Set(doc.relatedVolumes.map(getUuid))

	var missingVolumeUuids = yield doc.relatedDocuments.filter((doc) => (
		doc.volume &&
		!relatedVolumeUuids.has(doc.volume.uuid) &&
		isMeetingTopicDocument(doc)
	)).map((doc) => doc.volume.uuid)

	doc.missingVolumes = yield missingVolumeUuids.map(
		readVolumeWithDocuments.bind(null, api)
	)

	doc.statuses = (yield (doc.statuses || []).map(function*(status) {
		return _.assign({}, status, {
			relatedDocuments: (
				yield (status.relatedDocuments || []).map(readDocument)
			).filter(Boolean)
		})
	}))

	return doc

	function readDocument(doc) {
		var res = api("documents/" + doc.uuid)
		return res.then(getBody, raiseForDocument.bind(null, doc))
	}
}

function* replaceInitiative(opts, initiative, document) {
	var statuses = sortStatuses(document.statuses || EMPTY_ARR)
	var update = attrsFrom(document)

	if (initiative.uuid == null) {
		logger.log("Creating initiative %s (%s)…", document.uuid, document.title)
		initiative.uuid = initiative.parliament_uuid
		initiative = yield initiativesDb.create(_.assign(initiative, update))
	}
	else if (diff(initiative, update)) {
		logger.log("Updating initiative %s (%s)…", initiative.uuid, document.title)
		initiative = yield initiativesDb.update(initiative, update)
	}

	yield replaceFiles(initiative, document)

	var volumes = concat(
		document.volume || EMPTY_ARR,
		document.relatedVolumes,
		document.missingVolumes
	)

	var documents = document.relatedDocuments
	var eventAttrs = []

	// Unique drops later duplicates, which is what we prefer here.
	//
	// Initiative "Poliitikud ei või istuda kahel toolil" in the API has both
	// TAGASI_LYKATUD and MENETLUS_LOPETATUD statuses, with the former created 10
	// days prior. Let's assume the earlier entry is canonical and of more
	// interest to people, and the later MENETLUS_LOPETATUD status perhaps
	// formality.
	;[eventAttrs, documents] = _.map1st(concat.bind(null, eventAttrs), _.mapM(
		_.uniqBy(statuses, eventIdFromStatus),
		documents,
		eventAttrsFromStatus.bind(null, document)
	))

	;[eventAttrs, documents] = _.map1st(concat.bind(null, eventAttrs), _.mapM(
		volumes,
		documents,
		eventAttrsFromVolume.bind(null, opts, initiative)
	))

	;[eventAttrs, documents] = _.map1st(
		concat.bind(null, eventAttrs),
		_.partitionMap(documents, eventAttrsFromDocument)
	)

	eventAttrs = _.values(eventAttrs.filter(Boolean).reduce((obj, attrs) => (
		(obj[attrs.external_id] = _.merge({}, obj[attrs.external_id], attrs)), obj
	), {}))

	{
		// Deriving initiative attributes from all statuses, not only semantically
		// unique ones as events below. This works for all orderings of
		// MENETLUS_LOPETATUD is before TAGASI_LYKATUD.
		let update = {}
		statuses.forEach((status) => _.merge(update, attrsFromStatus(status)))
		eventAttrs.forEach((event) => _.merge(update, attrsFromEvent(event)))
		if (initiative.phase != "parliament") delete update.phase
		initiative = yield initiativesDb.update(initiative, update)
	}

	yield replaceEvents(initiative, eventAttrs)

	if (!opts.quiet) documents.forEach((document) => logger.warn(
		"Ignored initiative %s document %s (%s)",
		initiative.uuid,
		document.uuid,
		document.title
	))

	return initiative
}

function* replaceEvents(initiative, eventAttrs) {
	var events = yield eventsDb.search(sql`
		SELECT * FROM initiative_events
		WHERE initiative_uuid = ${initiative.uuid}
		AND origin = 'parliament'
	`)

	var eventsByExternalId = _.indexBy(events, "external_id")
	var createEvents = []
	var updateEvents = []

	eventAttrs.forEach(function(attrs) {
		var event = eventsByExternalId[attrs.external_id]
		if (event) attrs = mergeEvent(event, attrs)
		if (event && !diffEvent(event, attrs)) return

		attrs.updated_at = new Date
		if (event) return void updateEvents.push([event, attrs])

		attrs.created_at = new Date
		attrs.initiative_uuid = initiative.uuid
		createEvents.push(attrs)
	})

	createEvents.forEach((ev) => logger.log(
		"Creating event (%s) for initiative %s…",
		ev.type,
		initiative.uuid
	))

	updateEvents.forEach(([ev, _attrs]) => logger.log(
		"Updating event %d (%s) for initiative %s…",
		ev.id,
		ev.type,
		initiative.uuid
	))

	var createdEvents = yield eventsDb.create(createEvents)

	events = _.lastUniqBy(concat(
		events,
		createdEvents,
		yield updateEvents.map((eventAndAttrs) => eventsDb.update(...eventAndAttrs))
	), (ev) => ev.id)

	yield events.filter((ev) => ev.files && ev.files.length).map((event) => (
		replaceEventFiles(event, event.files)
	))

	// Ignoring older events protects against situations where old initiatives in
	// the parliament API get documents recreated. That happened in March
	// 2020 when a few dozen old initiatives got new UUIDs, which in turn fired
	// out hundreds of notification emails for new events.
	var relevantFrom = DateFns.addMonths(DateFns.startOfDay(new Date), -3)

	var relevantEvents = createdEvents.filter((ev) => (
		ev.occurred_at >= relevantFrom
	))

	if (relevantEvents.length > 0)
		yield sendParliamentEventEmail(initiative, relevantEvents)
}

function* replaceFiles(initiative, document) {
	var files = document.files || EMPTY_ARR
	files = files.filter(isPublicFile)
	if (files.length == 0) return

	var existingUuids = new Set(yield filesDb.search(sql`
		SELECT external_id
		FROM initiative_files
		WHERE initiative_uuid = ${initiative.uuid}
		AND event_id IS NULL
	`).then((files) => files.map((file) => file.external_id)))

	files = files.filter((file) => !existingUuids.has(file.uuid))
	files = files.map(fileAttrsFrom.bind(null, document))

	files = files.map((file) => ({
		__proto__: file,
		initiative_uuid: initiative.uuid
	}))

	yield filesDb.create(yield files.map(downloadFile))
}

function* replaceEventFiles(event, files) {
	if (files.length == 0) return

	var existingUuids = new Set(yield filesDb.search(sql`
		SELECT external_id FROM initiative_files WHERE event_id = ${event.id}
	`).then((files) => files.map((file) => file.external_id)))

	files = files.filter((file) => !existingUuids.has(file.external_id))

	files = files.map((file) => ({
		__proto__: file,
		event_id: event.id,
		initiative_uuid: event.initiative_uuid
	}))

	filesDb.create(yield files.map(downloadFile))
}

function newDocumentFiles(document, files) {
	files = files.filter(isPublicFile)
	files = files.map(fileAttrsFrom.bind(null, document))
	return files
}

function downloadFile(file) {
	if (file.event_id) logger.log(
		"Downloading event %d file «%s»…",
		file.event_id,
		file.name
	)
	else logger.log(
		"Downloading initiative %s file «%s»…",
		file.initiative_uuid,
		file.name
	)

	return parliamentApi(file.external_url).then((res) => ({
		__proto__: file,
		content: Buffer.from(res.body),
		content_type: res.headers["content-type"]
	}))
}

function attrsFrom(doc) {
	var attrs = {parliament_uuid: doc.uuid}
	var committee = getLatestCommittee(doc)
	if (committee) attrs.parliament_committee = committee.name
	return attrs
}

function attrsFromStatus(status) {
	var code = status.status.code

	// NOTE: The registered date indicates when the initiative was entered into
	// the document database. It may be later than when the initiative was given
	// to the parliament (submittingDate), such as with https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/203ef927-065e-4a2c-bb85-2a41487644aa.
	switch (code) {
		case "REGISTREERITUD": return null
		case "MENETLUSSE_VOETUD": return null
		case "TAGASI_LYKATUD": return {parliament_decision: "reject"}
		case "MENETLUS_LOPETATUD": return null

		case "ARUTELU_KOMISJONIS":
			// Ignoring the "continue" decision as that's not applicable as the final
			// initiative decision.
			switch (status.committeeDecision && status.committeeDecision.code) {
				case "LAHENDADA_MUUL_VIISIL":
					return {parliament_decision: "solve-differently"}
				case "ETTEPANEK_TAGASI_LYKATA":
					return {parliament_decision: "reject"}
				case "ETTEPANEK_INSTITUTSIOONILE":
					return {parliament_decision: "forward"}
				case "ETTEPANEK_VALITSUSELE":
					return {parliament_decision: "forward-to-government"}
				case "ALGATADA_EELNOU_VOI_OTRK":
					return {parliament_decision: "draft-act-or-national-matter"}

				default: return null
			}

		default: throw new RangeError("Unrecognized status: " + code)
	}
}

function attrsFromEvent(event) {
	switch (event.type) {
		case "parliament-received": return {
			received_by_parliament_at: event.occurred_at
		}

		case "parliament-accepted": return {
			accepted_by_parliament_at: event.occurred_at
		}

		case "parliament-finished": return {
			phase: "done",
			finished_in_parliament_at: event.occurred_at
		}

		case "parliament-committee-meeting": return null
		case "parliament-interpellation": return null
		case "parliament-letter": return null
		case "parliament-decision": return null
		case "parliament-board-meeting": return null
		case "parliament-national-matter": return null
		default: throw new RangeError("Unrecognized event type: " + event.type)
	}
}

function eventAttrsFromStatus(document, documents, status) {
	var eventDate = Time.parseIsoDate(status.date)
	var eventDocuments = []

	var attrs = {
		type: eventTypeFromStatus(status),
		origin: "parliament",
		external_id: eventIdFromStatus(status),
		occurred_at: eventDate
	}

	switch (status.status.code) {
		case "MENETLUSSE_VOETUD":
			;[eventDocuments, documents] = _.partition(documents, function(doc) {
				var documentTime

				return (
					isParliamentAcceptanceDocument(doc) ||
					doc.documentType == "protokoll" &&
					(documentTime = parseProtocolDateTime(doc)) &&
					Time.isSameDate(eventDate, documentTime)
				)
			})
			break

		case "ARUTELU_KOMISJONIS":
			;[eventDocuments, documents] = _.partition(documents, function(doc) {
				var documentTime

				// TODO: Ensure you don't find protocols of non-committee meetings.
				return (
					doc.documentType == "protokoll" &&
					(documentTime = parseProtocolDateTime(doc)) &&
					Time.isSameDate(eventDate, documentTime)
				)
			})
			break

		case "MENETLUS_LOPETATUD":
			;[eventDocuments, documents] = _.partition(
				documents,
				isParliamentResponseDocument
			)
			break
	}

	eventDocuments = concat(status.relatedDocuments || EMPTY_ARR, eventDocuments)

	// Create separate events for incoming letters. Outgoing letters on the other
	// hand may be due to the event, as is with parliament-finished event's final
	// reply.
	var letterDocuments
	;[letterDocuments, eventDocuments] = _.partition(eventDocuments, (doc) => (
		doc.documentType == "letterDocument" &&
		parseLetterDirection(doc.direction) == "incoming"
	))

	documents = documents.concat(letterDocuments)

	attrs.files = flatten(eventDocuments.map((doc) => (
		newDocumentFiles(doc, doc.files || EMPTY_ARR)
	)))

	var committee

	switch (status.status.code) {
		case "MENETLUSSE_VOETUD":
			committee = getLatestCommittee(document)
			attrs.content = {committee: committee && committee.name || null}
			break

		case "ARUTELU_KOMISJONIS":
			var protocol = eventDocuments[0]
			var protocolTime = protocol && parseProtocolDateTime(protocol)
			if (protocolTime) attrs.occurred_at = protocolTime

			committee = getLatestCommittee(document)

			attrs.content = {
				committee: (
					protocol && parseProtocolCommittee(protocol) ||
					committee && committee.name ||
					null
				),

				invitees: null
			}

			if (status.committeeDecision)
				attrs.content.decision = parseMeetingDecision(status.committeeDecision)
	}

	return [attrs, documents]
}

function eventAttrsFromDocument(document) {
	// NOTE: We can't read the committee out out from a mere acceptance document
	// as it contains no reference to it as is made by the parliament board.
	if (isParliamentAcceptanceDocument(document)) return {
		type: "parliament-accepted",
		origin: "parliament",
		external_id: "MENETLUSSE_VOETUD",
		occurred_at: Time.parseIsoDateTime(document.created),
		title: null,
		content: {date: document.decisionDate},
		files: newDocumentFiles(document, document.files || EMPTY_ARR)
	}

	// NOTE: Decisions may not all come from committees. They could come
	// mid-procesing from the parliament board, such as with https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/4972a788-1f6a-4608-ba54-cb21871e0107.
	if (document.documentType == "decisionDocument") return {
		type: "parliament-decision",
		origin: "parliament",
		external_id: document.uuid,
		occurred_at: Time.parseIsoDateTime(document.created),
		title: null,
		content: {date: document.decisionDate},
		files: newDocumentFiles(document, document.files || EMPTY_ARR)
	}

	if (isParliamentResponseDocument(document)) return {
		type: "parliament-finished",
		origin: "parliament",
		external_id: "MENETLUS_LOPETATUD",
		occurred_at: Time.parseIsoDateTime(document.created),
		title: null,
		content: null,
		files: newDocumentFiles(document, document.files || EMPTY_ARR)
	}

	if (document.documentType == "letterDocument") {
		var direction = parseLetterDirection(document.direction)

		// Not all letters have any files that are public. For example:
		// https://api.riigikogu.ee/api/documents/a117fc50-cceb-409f-b2c5-316f175ba480
		var files = newDocumentFiles(document, document.files || EMPTY_ARR)
		if (files.length == 0) return null

		// NOTE: The creation time of the letter document does not correspond to
		// the time it was received. The document may have been created later, as
		// with https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/e6ff7d42-1696-4b41-a87e-b2a91a0ad78e.
		return {
			type: "parliament-letter",
			origin: "parliament",
			external_id: document.uuid,
			occurred_at: Time.parseIsoDateTime(document.created),
			title: null,

			content: {
				medium: parseLetterMedium(document.receiveType),
				direction: direction,
				title: document.title,
				date: document.authorDate,
				[direction == "incoming" ? "from" : "to"]: document.author
			},

			files: files
		}
	}

	if (isParliamentBoardMeetingDocument(document)) {
		let time = parseInlineDateWithMaybeTime(document.title)

		return {
			type: "parliament-board-meeting",
			origin: "parliament",
			external_id: document.uuid,
			occurred_at: time,
			title: null,
			content: {},
			files: newDocumentFiles(document, document.files || EMPTY_ARR)
		}
	}

	if (isParliamentCommitteeMeetingDocument(document)) {
		let time = parseProtocolDateTime(document)
		var committee = parseProtocolCommittee(document)
		if (time == null || committee == null) return null

		return {
			type: "parliament-committee-meeting",
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/" + formatIsoDate(time),
			occurred_at: time,
			title: null,
			content: {committee: committee, invitees: null},
			files: newDocumentFiles(document, document.files || EMPTY_ARR)
		}
	}

	if (isParliamentNationalMatterDocument(document)) return {
		type: "parliament-national-matter",
		origin: "parliament",
		external_id: document.uuid,
		occurred_at: Time.parseIsoDateTime(document.created),
		title: null,
		content: {},
		files: newDocumentFiles(document, document.files || EMPTY_ARR)
	}

	return null
}

function eventAttrsFromVolume(opts, initiative, documents, volume) {
	if (isCommitteeMeetingVolume(volume)) {
		var time = parseInlineDateWithMaybeTime(volume.title)
		if (time == null) return null

		var topic = documents.find((doc) => (
			isMeetingTopicDocument(doc) && doc.volume.uuid == volume.uuid
		))

		documents = _.reject(documents, (doc) => doc.volume.uuid == volume.uuid)

		return [{
			type: "parliament-committee-meeting",
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/" + formatIsoDate(time),
			occurred_at: time,

			content: {
				committee: parseCommitteeReference(volume.reference),
				invitees: topic && topic.invitees || null
			},

			files: flatten(volume.documents.map((doc) => (
				newDocumentFiles(doc, doc.files || EMPTY_ARR)
			)))
		}, documents]
	}

	if (volume.volumeType == "interpellationsVolume") {
		var question = volume.documents.find((doc) => (
			doc.documentType == "interpellationsDocument"
		))

		if (question == null)
			throw new Error("Interpellation volume without document: " + volume.uuid)

		return [{
			type: "parliament-interpellation",
			origin: "parliament",
			external_id: volume.uuid,
			occurred_at: Time.parseIsoDateTime(volume.created),

			content: {
				to: question.addressee.value,
				date: question.submittingDate,
				deadline: question.answerDeadline
			},

			files: flatten(volume.documents.map((doc) => (
				newDocumentFiles(doc, doc.files || EMPTY_ARR)
			)))
		}, documents]
	}

	if (volume.volumeType == "letterVolume")
		return [null, concat(documents, volume.documents)]

	if (!opts.quiet) logger.warn(
		"Ignored initiative %s volume %s (%s)",
		initiative.uuid,
		volume.uuid,
		volume.title
	)

	return [null, documents]
}

function fileAttrsFrom(document, file) {
	return {
		external_id: file.uuid,
		external_url: FILE_URL + "/" + file.uuid,
		created_at: new Date,
		updated_at: new Date,
		name: file.fileName,
		title: file.fileTitle || document.title,
		url: DOCUMENT_URL + "/" + document.uuid
	}
}

function eventIdFromStatus(obj) {
	var code = obj.status.code

	switch (code) {
		case "REGISTREERITUD":
		case "MENETLUSSE_VOETUD":
		case "MENETLUS_LOPETATUD": return code
		case "TAGASI_LYKATUD": return "MENETLUS_LOPETATUD"
		case "ARUTELU_KOMISJONIS": return code + "/" + obj.date
		default: throw new RangeError("Unrecognized status: " + code)
	}
}

function eventTypeFromStatus(obj) {
	var code = obj.status.code

	switch (code) {
		case "REGISTREERITUD": return "parliament-received"
		case "MENETLUSSE_VOETUD": return "parliament-accepted"
		case "TAGASI_LYKATUD": return "parliament-finished"
		case "MENETLUS_LOPETATUD": return "parliament-finished"
		case "ARUTELU_KOMISJONIS": return "parliament-committee-meeting"
		default: throw new RangeError("Unrecognized status: " + code)
	}
}

function parseMeetingDecision(obj) {
	switch (obj.code) {
		case "JATKATA_ARUTELU": return "continue"
		case "AVALIK_ISTUNG": return "hold-public-hearing"
		case "LAHENDADA_MUUL_VIISIL": return "solve-differently"
		case "ETTEPANEK_TAGASI_LYKATA": return "reject"
		case "ETTEPANEK_INSTITUTSIOONILE": return "forward"
		case "ETTEPANEK_VALITSUSELE": return "forward-to-government"
		case "ALGATADA_EELNOU_VOI_OTRK": return "draft-act-or-national-matter"
		default: throw new RangeError("Unrecognized decision: " + obj.code)
	}
}

function parseInlineDateWithMaybeTime(str) {
	var parts =
		/\b(\d?\d)\.(\d?\d)\.(\d\d\d\d)(?: (?:kell )?(\d?\d):(\d\d))?\b/.exec(str)

	return parts && new Date(
		+parts[3],
		+parts[2] - 1,
		+parts[1],
		+parts[4] || 0,
		parts[5] || 0
	)
}

function parseTitle(title) {
	title = title.replace(/^Kollektiivne pöördumine\b\s*/i, "")
	title = title.replace(/^\s*-\s*/, "")
	title = title.replace(/^[„"](.*)["”]$/, "$1")
	return _.capitalize(title)
}

function normalizeParliamentDocumentForDiff(document) {
	var documents = document.relatedDocuments
	var volumes = document.relatedVolumes

	return {
		// NOTE: Diffing happens before documents and volumes have been populated
		// and therefore don't contain files and documents respectively.
		__proto__: document,
		statuses: document.statuses && sortStatuses(document.statuses),

		relatedDocuments:
			documents && _.sortBy(documents.map(normalizeDocument), "uuid"),

		relatedVolumes: volumes && _.sortBy(volumes.map(normalizeVolume), "uuid"),
		missingVolumes: null
	}

	// Ideally we'd compare something like an updated-at attribute, but there's
	// none in the /api/documents/collective-addresses response.
	function normalizeDocument(doc) {
		return {uuid: doc.uuid, title: doc.title, documentType: doc.documentType}
	}

	function normalizeVolume(volume) {
		return {
			uuid: volume.uuid,
			title: volume.title,
			volumeType: volume.volumeType,
			documents: (volume.documents || EMPTY_ARR).map(normalizeDocument)
		}
	}
}

function* readVolumeWithDocuments(api, uuid) {
	var volume = yield api("volumes/" + uuid).then(getBody)

	// Don't recurse into draft act documents for now as we're not sure what to
	// make of them yet.
	if (volume.volumeType != "eelnou")
		volume.documents = yield (volume.documents || EMPTY_ARR).map((doc) => (
			isMeetingTopicDocument(doc)
				? Promise.resolve(doc)
				: api("documents/" + doc.uuid).then(getBody)
		))

	return volume
}

function sortStatuses(statuses) {
	return _.sortBy(statuses, [
		(obj) => obj.date,
		(obj) => obj.status.code
	])
}

function isCommitteeMeetingVolume(volume) {
	return (
		volume.volumeType == "unitSittingVolume" &&
		volume.reference && parseCommitteeReference(volume.reference)
	)
}

function isMeetingTopicDocument(doc) {
	return doc.documentType == "unitAgendaItemDocument"
}

function isParliamentAcceptanceDocument(document) {
	return (
		document.documentType == "decisionDocument" &&
		document.title == "Kollektiivse pöördumise menetlusse võtmine"
	)
}

function isParliamentCommitteeMeetingDocument(document) {
	return (
		document.documentType == "protokoll" &&
		parseProtocolCommittee(document) != null
	)
}

function isParliamentBoardMeetingDocument(document) {
	return (
		document.documentType == "protokoll" &&
		document.title.match(/\bjuhatuse\b/)
	)
}

function isParliamentResponseDocument(document) {
	return (
		document.documentType == "letterDocument" &&
		document.title.match(/\bvastuskiri\b/i) &&
		!document.title.match(/selgitus/i) &&
		document.direction.code == "VALJA"
	)
}

function isParliamentNationalMatterDocument(document) {
	return (
		document.documentType == "otherQuestionDocument" &&
		document.subType &&
		document.subType.code == "OLULISE_TAHTSUSEGA_RIIKLIK_KUSIMUS"
	)
}

function mergeEvent(event, attrs) {
	switch (event.type) {
		case "parliament-accepted":
		case "parliament-committee-meeting":
			attrs.content = _.assign({}, event.content, attrs.content)

			if (event.content.committee)
				attrs.content.committee = event.content.committee

			break

		case "parliament-decision":
			attrs.content = _.assign({}, event.content, attrs.content)
			break
	}

	return attrs
}

function* sendParliamentEventEmail(initiative, events) {
	var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
	events = _.sortBy(events, "occurred_at")

	var message = yield messagesDb.create({
		initiative_uuid: initiative.uuid,
		origin: "event",
		created_at: new Date,
		updated_at: new Date,

		title: t("INITIATIVE_PARLIAMENT_EVENT_MESSAGE_TITLE", {
			initiativeTitle: initiative.title,
			eventDate: formatDate(_.last(events).occurred_at)
		}),

		text: renderEmail("INITIATIVE_PARLIAMENT_EVENT_MESSAGE_BODY", {
			initiativeTitle: initiative.title,
			initiativeUrl: initiativeUrl,
			eventsUrl: `${initiativeUrl}#events`,

			eventTitles: events.map((ev) => (
				`${formatDate(ev.occurred_at)} — ${renderEventTitle(initiative, ev)}`
			)).join("\n")
		})
	})

	yield Subscription.send(
		message,
		yield subscriptionsDb.searchConfirmedByInitiativeIdForOfficial(
			initiative.uuid
		)
	)
}

function parseProtocolDateTime(document) {
	return (
		document.volume && parseInlineDateWithMaybeTime(document.volume.title) ||
		parseInlineDateWithMaybeTime(document.title)
	)
}

// https://www.riigikogu.ee/riigikogu/koosseis/muudatused-koosseisus/
var COMMITTEES = {
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
}

function parseCommitteeReference(reference) {
	return COMMITTEES[reference.split("/")[1]] || null
}

function parseProtocolCommittee(document) {
	return document.volume && document.volume.reference
		? parseCommitteeReference(document.volume.reference)
		: null
}

function parseLetterDirection(direction) {
	switch (direction.code) {
		case "SISSE": return "incoming"
		case "VALJA": return "outgoing"
		case "SISEMINE": return "outgoing"
		default: throw new RangeError("Invalid direction: " + direction.code)
	}
}

function parseLetterMedium(medium) {
	switch (medium.code) {
		case "E_POST": return "email"
		case "TAVAPOST": return "post"
		case "KASIPOST": return "post"
		case "DVK": return "dokumendivahetuskeskus"
		case "DHX": return "dhx"
		default: throw new RangeError("Invalid medium: " + medium.code)
	}
}

function diffEvent(a, b) {
	return diff({__proto__: a, files: null}, {__proto__: b, files: null})
}

// From December 2020 to at least Jan 11, 2020, today, there are references in
// the API that return 500s (ie. the API's idea of 404).
//
// https://github.com/riigikogu-kantselei/api/issues/28
function raiseForDocument(doc, err) {
	// Silently ignore only agenda items. Let's continue to be notified of the
	// rest.
	if (is404(err) && doc.documentType == "unitAgendaItemDocument") return null
	throw err
}

function is404(err) {
	return (
		err instanceof FetchError && (
			err.code == 404 ||

			// Out of the chain of people involved, from rank and file developers to
			// analysts and architecture astronauts, none seemed to have realized
			// that 500 Internal Server Error might _not_ be suitable for
			// document-not-found…
			//
			// https://github.com/riigikogu-kantselei/api/issues/20
			err.code == 500 &&
			err.response &&
			err.response.body &&
			/^Document not found\b/.test(err.response.body.message)
		)
	)
}

function getLatestCommittee(doc) {
	var committees = doc.responsibleCommittee || EMPTY_ARR
	return committees.find((com) => com.active) || _.last(committees) || null
}

function getBody(res) { return res.body }
function getUuid(res) { return res.uuid }
function isPublicFile(file) { return file.accessRestrictionType == "PUBLIC" }

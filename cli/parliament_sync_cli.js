var _ = require("root/lib/underscore")
var Neodoc = require("neodoc")
var Time = require("root/lib/time")
var Config = require("root").config
var Subscription = require("root/lib/subscription")
var FetchError = require("fetch-error")
var ExternalApi = require("root/lib/external_api")
var Initiative = require("root/lib/initiative")
var parliamentApi = require("root/lib/parliament_api")
var diff = require("root/lib/diff")
var sql = require("sqlate")
var initiativesDb = require("root/db/initiatives_db")
var eventsDb = require("root/db/initiative_events_db")
var filesDb = require("root/db/initiative_files_db")
var messagesDb = require("root/db/initiative_messages_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var responsesDb = require("root/db/external_responses_db")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var renderEventTitle = require("root/lib/event").renderTitle
var isEventNotifiable = require("root/lib/event").isNotifiable
var t = require("root/lib/i18n").t.bind(null, "et")
var formatDate = require("root/lib/i18n").formatDate.bind(null, "numeric")
var formatIsoDate = require("root/lib/i18n").formatDate.bind(null, "iso")
var {logger} = require("root")
var co = require("co")
var EMPTY_ARR = Array.prototype
var PARLIAMENT_URL = "https://www.riigikogu.ee"
var DOCUMENT_URL = PARLIAMENT_URL + "/tegevus/dokumendiregister/dokument"
var COMMITTEES = require("root/lib/parliament_committees")
var COMMITTEES_BY_NAME = COMMITTEES.ID_BY_NAME
var COMMITTEES_BY_ABBR = COMMITTEES.ID_BY_ABBR
var FILE_URL = PARLIAMENT_URL + "/download"
module.exports = co.wrap(cli)

var USAGE_TEXT = `
Usage: cli parliament-sync (-h | --help)
       cli parliament-sync [options] [<uuid>]

Options:
    -h, --help   Display this help and exit.
    --quiet      Do not report ignored initiatives and documents.
    --no-email   Don't email about imported initiative events.
`

function* cli(argv) {
  var args = Neodoc.run(USAGE_TEXT, {argv: argv || ["parliament-sync"]})
  if (args["--help"]) return void process.stdout.write(USAGE_TEXT.trimLeft())

	var uuid = args["<uuid>"]
	if (uuid == "") throw new Error("Invalid UUID: " + uuid)

	yield sync({
		quiet: args["--quiet"],
		email: !args["--no-email"]
	}, uuid)
}

function* sync(opts, onlyUuid) {
	var api = new ExternalApi(parliamentApi.URL, parliamentApi, responsesDb)

	var docsRes = yield api.read("documents/collective-addresses")
	if (docsRes.status == 304) return

	for (let {uuid} of docsRes.body) {
		if (onlyUuid && uuid != onlyUuid) continue

		var docPath = "documents/collective-addresses/" + uuid
		var cached = api.readCached(docPath)

		// Because the /collective-addresses endpoint lacks `relatedDocuments` for
		// _some_ initiatives, we can't even rely on it for identifying updates.
		// We'll have to fetch the full document again. No If-None-Match, either:
		// https://github.com/riigikogu-kantselei/api/issues/35
		var initiativeDoc = yield api.read(docPath).then(getBody)

		if (cached && !diff(
			normalizeInitiativeDocumentForDiff(cached.body),
			normalizeInitiativeDocumentForDiff(initiativeDoc)
		)) continue

		yield syncInitiative(opts, api, initiativeDoc)
	}
}

function* syncInitiative(opts, api, initiativeDoc) {
	initiativeDoc = yield readInitiativeFromApi(api, initiativeDoc)

	// Around April 2020 old initiatives in the parliament API were recreated and
	// their old UUIDs were assigned to the `senderReference` field.
	// Unfortunately previous Rahvaalgatus' UUIDs (in `senderReference`) were
	// therefore overwritten  from `senderReference` making it impossible to
	// identify sent initiatives if you already don't have the previous parliament
	// UUID. Waiting for an update on that as of Apr 17, 2020.
	var initiative = initiativesDb.read(sql`
		SELECT * FROM initiatives
		WHERE uuid = ${initiativeDoc.senderReference}
		OR parliament_uuid = ${initiativeDoc.uuid}
		OR parliament_uuid = ${initiativeDoc.senderReference}
		LIMIT 1
	`)

	yield updateInitiativeFromDocument(opts, initiative, initiativeDoc)
}

// Because the /collective-addresses/:id endpoint didn't return
// files (https://github.com/riigikogu-kantselei/api/issues/27), we used to
// populate files from /documents/:id. Did so only on the first run on the
// assumption that no new files will appear after creation.
//
// A change made in the summer of 2020, however, broke the relatedDocuments
// attribute in the /collective-addresses/:id response, making it necessary
// to always load the parent document.
// https://github.com/riigikogu-kantselei/api/issues/33. As of Dec 10, 2023,
// both endpoints seem to return `relatedDocuments` at least for that example
// initiative. However the index endpoint now lacks `relatedDocuments`
// *inconsistently*.
//
// As of Sep 2, 2021 the /collective-addresses/:id endpoint lacks the
// volume property. The /documents/:id endpoint on the other hand lacks
// `relatedDocuments` on statuses.
//
// As of Dec 9, 2023, the /collective-addresses and /collective-addresses/:id
// endpoints still lacks the `volume` property which /documents/:id has, and
// only /collective-documents and /collective-documents/:id contain
// `relatedDocuments` on the `statuses` arrays.
//
// As of Dec 9, 2023, the /collective-addresses index endpoint lacks
// `relatedDocuments` for _some_ initiatives:
// https://github.com/riigikogu-kantselei/api/issues/34.
//
// The /collective-addresses index endpoint _also_ differs from
// /collective-addresses/:id Dec 9, 2023 regarding `accessRestrictionHistory`
// on files. The former lacks it.
// https://github.com/riigikogu-kantselei/api/issues/36
function* readInitiativeFromApi(api, initiativeDoc) {
	if (initiativeDoc.volume == null) {
		var initiativeOtherDoc =
			yield api.read("documents/" + initiativeDoc.uuid).then(getBody)

		initiativeDoc.volume = initiativeOtherDoc.volume || null
	}

	if (initiativeDoc.volume) {
		initiativeDoc.volume =
			yield readVolumeWithDocuments(api, initiativeDoc.volume.uuid)

		initiativeDoc.volume.documents =
			_.reject(initiativeDoc.volume.documents, (doc) => (
				doc.uuid == initiativeDoc.uuid
			))
	}

	// Note we need to fetch the initiative as a document, too, as the
	// /collective-addresses/:id response doesn't include the volume property.
	//
	// Don't then fetch all volumes for all documents as some of them include
	// documents unrelated to the initiative. For example, an initiative
	// acceptance decision (https://api.riigikogu.ee/api/documents/d655bc48-e5ec-43ad-9640-8cba05f78427)
	// resides in a "All parliament decisions in 2019" volume.
	initiativeDoc.relatedDocuments = (
		yield (initiativeDoc.relatedDocuments || []).map(readDocument.bind(null, api))
	).filter(Boolean)

	initiativeDoc.relatedVolumes =
		yield (initiativeDoc.relatedVolumes || []).map(getUuid).map(
			readVolumeWithDocuments.bind(null, api)
		)

	var relatedVolumeUuids = new Set(initiativeDoc.relatedVolumes.map(getUuid))

	var missingVolumeUuids =
		yield initiativeDoc.relatedDocuments.filter((doc) => (
			doc.volume &&
			!relatedVolumeUuids.has(doc.volume.uuid) &&
			isMeetingTopicDocument(doc)
		)).map((doc) => doc.volume.uuid)

	initiativeDoc.missingVolumes = yield missingVolumeUuids.map(
		readVolumeWithDocuments.bind(null, api)
	)

	initiativeDoc.statuses =
		yield (initiativeDoc.statuses || []).map(function*(status) {
			return _.assign({}, status, {
				relatedDocuments: yield (status.relatedDocuments || []).map(
					readDocument.bind(null, api)
				).filter(Boolean),

				relatedVolumes: yield (status.relatedVolumes || []).map((volume) => (
					readVolumeWithDocuments(api, volume.uuid)
				))
			})
		})

	return initiativeDoc
}

function* updateInitiativeFromDocument(opts, initiative, initiativeDoc) {
	var update = initiativeAttrsFromInitiativeDocument(initiativeDoc)

	if (initiative == null) {
		logger.log(
			"Creating initiative %s (%s)…",
			initiativeDoc.uuid,
			initiativeDoc.title
		)

		// Use submittedDate as some initiatives documents were recreated
		// 5 years after the actual submitting date. Example:
		// https://api.riigikogu.ee/api/documents/collective-addresses/b9a5b10c-3744-49bc-b4f4-cecf34721b1f
		//
		// TODO: Ensure time parsing is always in Europe/Tallinn and don't depend
		// on TZ being set.
		// https://github.com/riigikogu-kantselei/api/issues/11
		var createdAt = (
			initiativeDoc.submittingDate &&
			Time.parseIsoDate(initiativeDoc.submittingDate) ||

			initiativeDoc.created && Time.parseIsoDateTime(initiativeDoc.created) ||
			new Date
		)

		var title = initiativeDoc.title ? parseTitle(initiativeDoc.title) : "?"

		initiative = initiativesDb.create(_.assign({
			uuid: initiativeDoc.uuid,
			parliament_uuid: initiativeDoc.uuid,
			external: true,
			phase: "parliament",
			destination: "parliament",
			title: title,
			slug: Initiative.slug(title),
			author_name: initiativeDoc.sender || "",
			created_at: createdAt,
			published_at: createdAt
		}, update))
	}
	else if (diff(initiative, update)) {
		logger.log(
			"Updating initiative %s (%s)…",
			initiative.uuid,
			initiativeDoc.title
		)

		initiative = initiativesDb.update(initiative, update)
	}

	yield replaceFiles(initiative, initiativeDoc)

	var volumes = _.concat(
		initiativeDoc.volume || EMPTY_ARR,
		initiativeDoc.relatedVolumes,
		initiativeDoc.missingVolumes
	)

	var volumeUuids = new Set(_.map(volumes, "uuid"))

	var documents = initiativeDoc.relatedDocuments.filter((doc) => (
		doc.volume == null || !volumeUuids.has(doc.uuid)
	))

	var eventAttrs = []

	// Unique drops later duplicates, which is what we prefer here.
	//
	// Initiative "Poliitikud ei või istuda kahel toolil" in the API has both
	// TAGASI_LYKATUD and MENETLUS_LOPETATUD statuses, with the former created 10
	// days prior. Let's assume the earlier entry is canonical and of more
	// interest to people, and the later MENETLUS_LOPETATUD status perhaps
	// formality.
	var statuses = sortStatuses(initiativeDoc.statuses || EMPTY_ARR)

	;[eventAttrs, documents] = _.map1st(_.concat.bind(null, eventAttrs), _.mapM(
		_.uniqBy(statuses, eventIdFromStatus),
		documents,
		eventAttrsFromStatus.bind(null, opts, initiative, initiativeDoc)
	))

	var [volumeEventsAttrs, addedDocuments] = _.unzip(volumes.map(
		eventAttrsFromVolume.bind(null, opts, initiative)
	))

	eventAttrs = _.concat(eventAttrs, volumeEventsAttrs)
	documents = _.concat(documents, _.flatten(addedDocuments))

	;[eventAttrs, documents] = _.map1st(
		_.concat.bind(null, eventAttrs),
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
		initiative = initiativesDb.update(initiative, update)
	}

	yield replaceEvents(opts, initiative, eventAttrs)

	if (!opts.quiet) documents.forEach((initiativeDoc) => logger.warn(
		"Ignored initiative %s document %s (%s)",
		initiative.uuid,
		initiativeDoc.uuid,
		initiativeDoc.title
	))

	initiativesDb.update(initiative, {parliament_synced_at: new Date})
}

function* replaceEvents(opts, initiative, eventAttrs) {
	var events = eventsDb.search(sql`
		SELECT * FROM initiative_events
		WHERE initiative_uuid = ${initiative.uuid}
		AND origin = 'parliament'
	`)

	var eventsByExternalId = _.indexBy(events, "external_id")
	var ignoreEvents = []
	var createEvents = []
	var updateEvents = []

	eventAttrs.forEach(function(attrs) {
		var event = eventsByExternalId[attrs.external_id]
		if (event) attrs = mergeEvent(event, attrs)

		if (event && !diffEvent(event, attrs))
			return void ignoreEvents.push(_.defaults({files: attrs.files}, event))

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

	var createdEvents = eventsDb.create(createEvents)

	events = _.lastUniqBy(_.concat(
		ignoreEvents,
		createdEvents,
		updateEvents.map((eventAndAttrs) => eventsDb.update(...eventAndAttrs))
	), (ev) => ev.id)

	yield events.filter((ev) => ev.files && ev.files.length).map((event) => (
		replaceEventFiles(event, event.files)
	))

	var relevantEvents = createdEvents.filter(
		isEventNotifiable.bind(null, new Date, initiative)
	)

	if (opts.email && relevantEvents.length > 0)
		yield sendParliamentEventEmail(initiative, relevantEvents)
}

function* replaceFiles(initiative, document) {
	var files = document.files || EMPTY_ARR
	files = files.filter(isPublicFile)
	if (files.length == 0) return

	var existingUuids = new Set(filesDb.search(sql`
		SELECT external_id
		FROM initiative_files
		WHERE initiative_uuid = ${initiative.uuid}
		AND event_id IS NULL
	`).map((file) => file.external_id))

	files = files.filter((file) => !existingUuids.has(file.uuid))
	files = files.map(fileAttrsFrom.bind(null, document))

	files = files.map((file) => ({
		__proto__: file,
		initiative_uuid: initiative.uuid
	}))

	filesDb.create(yield files.map(downloadFile))
}

function* replaceEventFiles(event, files) {
	if (files.length == 0) return

	var existingUuids = new Set(filesDb.search(sql`
		SELECT external_id FROM initiative_files WHERE event_id = ${event.id}
	`).map((file) => file.external_id))

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
		content_type: res.headers.get("content-type")
	}))
}

function initiativeAttrsFromInitiativeDocument(doc) {
	return {
		parliament_uuid: doc.uuid,
		parliament_committees: getActiveCommitteeIds(doc)
	}
}

function attrsFromStatus(status) {
	var {code} = status.status

	// NOTE: The registered date indicates when the initiative was entered into
	// the document database. It may be later than when the initiative was given
	// to the parliament (submittingDate), such as with https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/203ef927-065e-4a2c-bb85-2a41487644aa.
	switch (code) {
		case "REGISTREERITUD": return null
		case "MENETLUSSE_VOETUD": return null
		case "TAGASTATUD": return {parliament_decision: "return"}
		case "TAGASI_LYKATUD": return {parliament_decision: "reject"}
		case "MENETLUS_LOPETATUD": return null
		case "ARUTELU_TAISKOGUL": return null

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
		case "parliament-plenary-meeting": return null
		case "parliament-interpellation": return null
		case "parliament-letter": return null
		case "parliament-decision": return null
		case "parliament-board-meeting": return null
		case "parliament-national-matter": return null
		default: throw new RangeError("Unrecognized event type: " + event.type)
	}
}

function eventAttrsFromStatus(
	opts,
	initiative,
	initiativeDocument,
	otherDocuments,
	status
) {
	var eventDate = Time.parseIsoDate(status.date)
	if (eventDate == null) throw new SyntaxError("Invalid date: " + status.date)

	var eventDocuments = []

	var attrs = {
		type: eventTypeFromStatus(status),
		origin: "parliament",
		external_id: eventIdFromStatus(status),
		occurred_at: eventDate
	}

	switch (status.status.code) {
		case "MENETLUSSE_VOETUD":
			attrs.content = {
				committees: getActiveCommitteeIds(initiativeDocument) || null
			}

			;[
				eventDocuments,
				otherDocuments
			] = _.partition(otherDocuments, function(doc) {
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
			;[
				eventDocuments,
				otherDocuments
			] = _.partition(otherDocuments, function(doc) {
				var documentTime

				return (
					isParliamentCommitteeMeetingProtocolDocument(doc) &&
					(documentTime = parseProtocolDateTime(doc)) &&
					Time.isSameDate(eventDate, documentTime)
				)
			})

			var protocol = eventDocuments.find(
				isParliamentCommitteeMeetingProtocolDocument
			)

			var protocolTime = protocol && parseProtocolDateTime(protocol)
			if (protocolTime) attrs.occurred_at = protocolTime

			attrs.content = {
				committee: (
					// Don't default to the latest committee if there's a protocol, as it
					// might be an old event.
					protocol ? parseProtocolDocumentCommittee(protocol) :
					getLastCommitteeId(initiativeDocument)
				),

				invitees: null,
				links: (status.relatedOuterLinks || EMPTY_ARR).map(parseLink)
			}

			if (status.committeeDecision)
				attrs.content.decision = parseMeetingDecision(status.committeeDecision)
			break

		case "ARUTELU_TAISKOGUL":
			attrs.content = {
				links: (status.relatedOuterLinks || EMPTY_ARR).map(parseLink)
			}
			break

		case "MENETLUS_LOPETATUD":
			;[eventDocuments, otherDocuments] = _.partition(
				otherDocuments,
				isParliamentResponseDocument
			)
			break
	}

	eventDocuments = _.concat(
		status.relatedDocuments || EMPTY_ARR,
		eventDocuments
	)

	// Create separate events for incoming letters. Outgoing letters on the other
	// hand may be due to the event, as is with parliament-finished event's final
	// reply.
	var letterDocuments
	;[letterDocuments, eventDocuments] = _.partition(eventDocuments, (doc) => (
		doc.documentType == "letterDocument" &&
		parseLetterDirection(doc.direction) == "incoming"
	))

	otherDocuments = otherDocuments.concat(letterDocuments)

	attrs.files = eventDocuments.flatMap((doc) => (
		newDocumentFiles(doc, doc.files || EMPTY_ARR)
	))

	attrs = (status.relatedVolumes || EMPTY_ARR).map(
		eventAttrsFromVolume.bind(null, opts, initiative)
	).map(_.first).filter(Boolean).filter((ev) => (
		ev.external_id == attrs.external_id
	)).reduce(mergeEvent, attrs)

	return [attrs, otherDocuments]
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

	if (isParliamentBoardMeetingProtocolDocument(document)) {
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

	if (isParliamentCommitteeMeetingProtocolDocument(document)) {
		let time = parseProtocolDateTime(document)
		var committee = parseProtocolDocumentCommittee(document)
		if (time == null) return null

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

		occurred_at: (
			Time.parseIsoDate(document.respondDate) ||
			Time.parseIsoDateTime(document.created)
		),

		title: null,
		content: {},
		files: newDocumentFiles(document, document.files || EMPTY_ARR)
	}

	return null
}

function eventAttrsFromVolume(opts, initiative, volume) {
	if (isCommitteeMeetingVolume(volume)) {
		// The meeting volume does not have a date property, so we have to resort
		// to parsing it from the title.
		var time = parseInlineDateWithMaybeTime(volume.title)
		if (time == null) return null

		var topic = volume.documents.find((doc) => (
			isMeetingTopicDocument(doc) && doc.volume.uuid == volume.uuid
		))

		return [{
			type: "parliament-committee-meeting",
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/" + formatIsoDate(time),
			occurred_at: time,

			content: {
				committee: COMMITTEES_BY_ABBR[parseReference(volume.reference)] || null,
				invitees: topic && topic.invitees || null
			},

			files: volume.documents.flatMap((doc) => (
				newDocumentFiles(doc, doc.files || EMPTY_ARR)
			))
		}, []]
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

			files: volume.documents.flatMap((doc) => (
				newDocumentFiles(doc, doc.files || EMPTY_ARR)
			))
		}, []]
	}

	if (volume.volumeType == "letterVolume")
		return [null, _.concat(volume.documents, volume.relatedDocuments)]

	if (!opts.quiet) logger.warn(
		"Ignored initiative %s volume %s (%s)",
		initiative.uuid,
		volume.uuid,
		volume.title
	)

	return [null, []]
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
	var {code} = obj.status

	switch (code) {
		case "REGISTREERITUD":
		case "MENETLUSSE_VOETUD":
		case "TAGASTATUD":
		case "MENETLUS_LOPETATUD": return code
		case "TAGASI_LYKATUD": return "MENETLUS_LOPETATUD"
		case "ARUTELU_KOMISJONIS": return code + "/" + obj.date
		case "ARUTELU_TAISKOGUL": return code + "/" + obj.date
		default: throw new RangeError("Unrecognized status: " + code)
	}
}

function eventTypeFromStatus(obj) {
	var {code} = obj.status

	switch (code) {
		case "REGISTREERITUD": return "parliament-received"
		case "MENETLUSSE_VOETUD": return "parliament-accepted"
		case "TAGASTATUD": return "parliament-finished"
		case "TAGASI_LYKATUD": return "parliament-finished"
		case "MENETLUS_LOPETATUD": return "parliament-finished"
		case "ARUTELU_KOMISJONIS": return "parliament-committee-meeting"
		case "ARUTELU_TAISKOGUL": return "parliament-plenary-meeting"
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
		/\b(\d?\d)\.(\d?\d)\.(\d\d\d\d)(?: (?:kell )?(\d?\d)[:.](\d\d))?\b/.exec(str)

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

function normalizeInitiativeDocumentForDiff(initiativeDoc) {
	return _.defaults({
		files: initiativeDoc.files
			? _.sortBy(initiativeDoc.files.map(normalizeFile), "uuid")
			: [],

		statuses: initiativeDoc.statuses
			? sortStatuses(initiativeDoc.statuses.map(normalizeStatus))
			: [],

		relatedDocuments: initiativeDoc.relatedDocuments
			? _.sortBy(initiativeDoc.relatedDocuments, "uuid")
			: [],

		relatedVolumes: initiativeDoc.relatedVolumes
			? _.sortBy(initiativeDoc.relatedVolumes, "uuid")
			: []
	}, initiativeDoc)

	function normalizeFile(file) {
		return _.defaults({accessRestrictionHistory: null}, file)
	}

	function normalizeStatus(status) {
		return _.defaults({
			relatedDocuments: status.relatedDocuments
				? _.sortBy(status.relatedDocuments, "uuid")
				: [],

			relatedVolumes: status.relatedVolumes
				? _.sortBy(status.relatedVolumes, "uuid")
				: []
		}, status)
	}
}

function* readVolumeWithDocuments(api, uuid) {
	var volume = yield api.read("volumes/" + uuid).then(getBody)

	// Don't recurse into draft act documents for now as we're not sure what to
	// make of them yet.
	if (volume.volumeType == "eelnou") return volume

	volume.documents = (
		yield (volume.documents || EMPTY_ARR).map(readDocument.bind(null, api))
	).filter(Boolean)

	volume.relatedDocuments = (yield (
		volume.relatedDocuments || EMPTY_ARR
	).map(readDocument.bind(null, api))).filter(Boolean)

	return volume
}

function readDocument(api, doc) {
	// Don't ignore all meeting topic documents (unitAgendaItemDocument) though,
	// as some are perfectly available from /documents/:id. For example:
	// https://api.riigikogu.ee/api/documents/6c467b55-5425-47c0-b50f-faced52b747e
	var res = api.read("documents/" + doc.uuid)
	return res.then(getBody, raiseForDocument.bind(null, doc))
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
		volume.reference && isCommitteeReference(parseReference(volume.reference))
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

function isParliamentCommitteeMeetingProtocolDocument(document) {
	if (!document.documentType == "protokoll") return null
	return isCommitteeReference(parseDocumentReference(document))
}

function isCommitteeReference(reference) {
	// Some joint meetings have a reference of "YHIS".
	return reference in COMMITTEES_BY_ABBR || reference == "YHIS"
}

function isParliamentBoardMeetingProtocolDocument(document) {
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
			attrs.content = _.assign({}, event.content, attrs.content)

			if (event.content.committees)
				attrs.content.committees = event.content.committees

			break

		case "parliament-committee-meeting":
			attrs.content = _.assign({}, event.content, attrs.content)

			if (event.content.committee)
				attrs.content.committee = event.content.committee

			break

		case "parliament-plenary-meeting":
		case "parliament-decision":
			attrs.content = _.assign({}, event.content, attrs.content)
			break
	}

	if (event.files) attrs.files = (
		event.files.length > 0 &&
		attrs.files && attrs.files.length > 0
	) ? _.concat(event.files, attrs.files) : event.files

	return attrs
}

function* sendParliamentEventEmail(initiative, events) {
	var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
	events = _.sortBy(events, "occurred_at")

	var message = messagesDb.create({
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
		subscriptionsDb.searchConfirmedByInitiativeForEvent(initiative)
	)
}

function parseProtocolDateTime(document) {
	return (
		document.volume && parseInlineDateWithMaybeTime(document.volume.title) ||
		parseInlineDateWithMaybeTime(document.title)
	)
}

function parseDocumentReference(document) {
	return (
		document.volume && document.volume.reference &&
		parseReference(document.volume.reference) || null
	)
}

function parseProtocolDocumentCommittee(document) {
	return COMMITTEES_BY_ABBR[parseDocumentReference(document)] || null
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
	if (is404(err) && isMeetingTopicDocument(doc)) return null

	// Opinion documents are unavailable from the /documents endpoint. There's no
	// way to directly get them as of Apr 8, 2021. You're supposed to know the
	// draft act UUID and use /volumes/drafts.
	if (is404(err) && doc.documentType == "opinionDocument") return null

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

function getLastCommitteeId(doc) {
	var committees = (doc.responsibleCommittee || EMPTY_ARR)
	var committee = committees.find(({active}) => active) || _.last(committees)

	return committee
		? COMMITTEES_BY_NAME[committee.name] || committee.name
		: null
}

function getActiveCommitteeIds(doc) {
	return (doc.responsibleCommittee || EMPTY_ARR)
		.filter(({active}) => active)
		.map(({name}) => COMMITTEES_BY_NAME[name] || name)
}

function parseLink(link) {
	return {title: link.outerLinkTitle, url: link.outerLink}
}

function parseReference(reference) {
	var parts = reference.split("/")
	return parts.length >= 3 ? parts[1] : null
}

function getBody(res) { return res.body }
function getUuid(res) { return res.uuid }
function isPublicFile(file) { return file.accessRestrictionType == "PUBLIC" }

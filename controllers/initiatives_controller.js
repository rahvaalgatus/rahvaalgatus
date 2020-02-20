var _ = require("root/lib/underscore")
var O = require("oolong")
var Qs = require("querystring")
var Url = require("url")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var Topic = require("root/lib/topic")
var DateFns = require("date-fns")
var Time = require("root/lib/time")
var Config = require("root/config")
var Crypto = require("crypto")
var MediaType = require("medium-type")
var Subscription = require("root/lib/subscription")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var imagesDb = require("root/db/initiative_images_db")
var filesDb = require("root/db/initiative_files_db")
var commentsDb = require("root/db/comments_db")
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var next = require("co-next")
var cosDb = require("root").cosDb
var t = require("root/lib/i18n").t.bind(null, Config.language)
var renderEmail = require("root/lib/i18n").email
var sql = require("sqlate")
var sqlite = require("root").sqlite
var translateCitizenError = require("root/lib/citizenos_api").translateError
var searchTopics = require("root/lib/citizenos_db").searchTopics
var readVoteOptions = require("root/lib/citizenos_db").readVoteOptions
var concat = Array.prototype.concat.bind(Array.prototype)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var trim = Function.call.bind(String.prototype.trim)
var sendEmail = require("root").sendEmail
var searchInitiativeEvents = _.compose(searchInitiativesEvents, concat)
var {countSignaturesById} = require("root/lib/initiative")
var {countSignaturesByIds} = require("root/lib/initiative")
var {countUndersignedSignaturesById} = require("root/lib/initiative")
var ENV = process.env.ENV
var EMPTY_ARR = Array.prototype
var EMPTY_INITIATIVE = {title: ""}
var EMPTY_CONTACT = {name: "", email: "", phone: ""}
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
exports.searchInitiativesEvents = searchInitiativesEvents
exports.readCitizenSignature = readCitizenSignature

var RESPONSE_TYPES = [
	"text/html",
	"application/vnd.rahvaalgatus.initiative+json; v=1",
	"application/atom+xml"
].map(MediaType)

var RESPONSE_PATTERNS = ["image/*"].map(MediaType)

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res) {
	var gov = req.government

	var initiatives = yield initiativesDb.search(sql`
		SELECT initiative.*, user.name AS user_name
		FROM initiatives AS initiative
		LEFT JOIN users AS user ON initiative.user_id = user.id
		WHERE destination IS NULL AND phase = 'edit'
		OR destination ${gov == "parliament" ? sql`==` : sql`!=`} "parliament"
	`)

	var topics = _.indexBy(yield searchTopics(sql`
		topic.id IN ${sql.in(initiatives.map((i) => i.uuid))}
		AND topic.visibility = 'public'
	`), "id")

	initiatives = initiatives.filter((initiative) => (
		initiative.external ||
		topics[initiative.uuid]
	))

	initiatives = initiatives.filter((initiative) => (
		!initiative.archived_at ||
		initiative.phase != "edit" ||
		initiative.external ||
		topics[initiative.uuid].sourcePartnerId == Config.apiPartnerId
	))

	initiatives.forEach(function(initiative) {
		var topic = topics[initiative.uuid]
		if (topic) initiative.title = topic.title
	})

	var category = req.query.category

	if (category) {
		topics = _.filterValues(topics, hasCategory.bind(null, category))
		initiatives = initiatives.filter((initiative) => topics[initiative.uuid])
	}

	var signatureCounts = yield countSignaturesByIds(_.keys(topics))

	var recentInitiatives = category
		? EMPTY_ARR
		: yield searchRecentInitiatives(initiatives)

	res.render("initiatives_page.jsx", {
		initiatives: initiatives,
		recentInitiatives: recentInitiatives,
		topics: topics,
		signatureCounts: signatureCounts
	})
}))

exports.router.post("/", next(function*(req, res) {
	var user = req.user
	if (user == null) throw new HttpError(401)

	var title = _.escapeHtml(req.body.title)
	var attrs = O.assign({}, EMPTY_INITIATIVE, {
		title: req.body.title,
		visibility: "private",

		// NOTE: CitizenOS or Etherpad saves all given whitespace as
		// non-breaking-spaces, so make sure to not have any around <body> or other
		// tags.
		description: req.t("INITIATIVE_DEFAULT_HTML", {title: title}),
	})

	if (!req.body["accept-tos"]) res.render("initiatives/create_page.jsx", {
		error: req.t("CONFIRM_I_HAVE_READ"),
		attrs: attrs
	})

	var created = yield req.cosApi("/api/users/self/topics", {
		method: "POST",
		json: attrs
	}).catch(catch400)

	if (!isOk(created))
		return void res.status(422).render("initiatives/create_page.jsx", {
			error: translateCitizenError(req.t, created.body),
			attrs: attrs
		})

	var topic = created.body.data

	yield initiativesDb.create({
		uuid: topic.id,
		user_id: user.id,
		created_at: new Date,
		undersignable: Config.undersignable
	})

	res.redirect(303, req.baseUrl + "/" + topic.id + "/edit")
}))

exports.router.get("/new", function(_req, res) {
	res.render("initiatives/create_page.jsx", {attrs: EMPTY_INITIATIVE})
})

exports.router.use("/:id", next(function*(req, res, next) {
	var initiative = yield initiativesDb.read(sql`
		SELECT initiative.*, user.name AS user_name
		FROM initiatives AS initiative
		LEFT JOIN users AS user ON initiative.user_id = user.id
		WHERE initiative.uuid = ${req.params.id}
	`)

	if (initiative == null) throw new HttpError(404)

	var user = req.user
	var topic
	if (!initiative.external) {
		topic = yield searchTopics(sql`topic.id = ${initiative.uuid}`).then(_.first)
		if (topic == null) throw new HttpError(404)

		var permission = yield readTopicPermission(user, topic)

		if (!(
			topic.visibility == "public" ||
			permission == "admin" ||
			permission == "edit"
		)) throw new HttpError(403, "Initiative Not Public")

		topic.permission = {level: permission}
		initiative.title = topic.title
	}

	if (req.method == "HEAD" || req.method == "GET") {
		var isLocalInitiative = (
			initiative.destination &&
			initiative.destination != "parliament"
		)

		var path = req.baseUrl + req.url.replace(/^\/\?/, "?")

		if (req.government == "parliament" && isLocalInitiative)
			return void res.redirect(301, Config.localUrl + path)
		else if (req.government == "local" && !isLocalInitiative)
			return void res.redirect(301, Config.url + path)
	}

	req.topic = topic
	req.initiative = initiative
	res.locals.topic = topic
	res.locals.initiative = initiative
	next()
}))

exports.router.get("/:id",
	new ResponseTypeMiddeware(RESPONSE_TYPES, RESPONSE_PATTERNS),
	next(function*(req, res, next) {
	var type = res.contentType
	var initiative = req.initiative

	if (type.type == "image") {
		var image = yield imagesDb.read(sql`
			SELECT type, preview
			FROM initiative_images
			WHERE initiative_uuid = ${initiative.uuid}
		`)

		if (!image) throw new HttpError(406)
		if (!image.type.match(type)) throw new HttpError(406)

		res.setHeader("Content-Type", image.type)
		res.setHeader("Content-Length", image.preview.length)
		res.end(image.preview)
	}
	else switch (type.name) {
		case "application/vnd.rahvaalgatus.initiative+json":
			res.setHeader("Content-Type", type)
			res.setHeader("Access-Control-Allow-Origin", "*")

			res.send(serializeApiInitiative(
				initiative,
				initiative.external ? null : yield countSignaturesById(initiative.uuid)
			))
			break

		case "application/atom+xml":
			var events = yield searchInitiativeEvents(initiative)
			res.setHeader("Content-Type", type)
			res.render("initiatives/atom.jsx", {events: events})
			break

		default: exports.read(req, res, next)
	}
}))

exports.read = next(function*(req, res) {
	var user = req.user
	var topic = req.topic
	var initiative = req.initiative
	var newSignatureId = req.flash("signatureId")
	var newSignatureToken = req.flash("signatureToken")
	var thank = false
	var thankAgain = false
	var signature

	if (initiative.phase == "sign" && newSignatureToken) {
		signature = yield signaturesDb.read(sql`
			SELECT * FROM initiative_signatures
			WHERE initiative_uuid = ${initiative.uuid}
			AND token = ${Buffer.from(newSignatureToken, "hex")}
		`)

		thank = !!signature
		thankAgain = signature && signature.oversigned > 0
	}
	else if (initiative.phase == "sign" && newSignatureId) {
		var cosSignature = yield cosDb.query(sql`
			SELECT signature.*, opt.value AS support
			FROM "VoteLists" AS signature
			JOIN "VoteOptions" AS opt ON opt.id = signature."optionId"
			WHERE signature.id = ${newSignatureId}
		`).then(_.first)

		var cosPrevSignature = yield cosDb.query(sql`
			SELECT signature.*, opt.value AS support
			FROM "VoteLists" AS signature
			JOIN "VoteOptions" AS opt ON opt.id = signature."optionId"

			WHERE signature."voteId" = ${cosSignature.voteId}
			AND signature."userId" = ${cosSignature.userId}
			AND signature."createdAt" <= ${
				DateFns.addSeconds(cosSignature.createdAt, -15)
			}
			ORDER BY "createdAt" DESC
			LIMIT 1
		`).then(_.first)

		// This could assign a newer signature as the one redirected with, but
		// that's unlikely to be a big problem.
		thank = cosSignature.support == "Yes"
		if (!thank) res.flash("notice", req.t("SIGNATURE_REVOKED"))

		// Currently checking for old signatures even if they were hidden — that's
		// because by the time we land here, the signature in SQLite has been
		// marked unhidden.
		thankAgain = cosPrevSignature && cosPrevSignature.support == "Yes"

		signature = cosSignature.support == "No" ? null : {
			initiative_uuid: initiative.uuid,
			hidden: false
		}
	}

	var subscriberCount = yield sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.uuid} AND confirmed_at IS NOT NULL
	`).then(_.first).then((row) => row.count)

	var comments = yield searchInitiativeComments(initiative.uuid)
	var events = yield searchInitiativeEvents(initiative)

	var subscription = user && user.email && user.email_confirmed_at
		? yield subscriptionsDb.read(sql`
			SELECT * FROM initiative_subscriptions
			WHERE initiative_uuid = ${initiative.uuid}
			AND email = ${user.email}
			LIMIT 1
		`)
		: null

	var files = yield filesDb.search(sql`
		SELECT id, name, title, content_type, length(content) AS size
		FROM initiative_files
		WHERE initiative_uuid = ${initiative.uuid}
		AND event_id IS NULL
	`)

	var signatureCount = yield countSignaturesById(initiative.uuid)

	var voteOptions = initiative.phase == "sign"
		? yield readVoteOptions(topic.vote.id)
		: null

	var image = yield imagesDb.read(sql`
		SELECT initiative_uuid, type
		FROM initiative_images
		WHERE initiative_uuid = ${initiative.uuid}
	`)

	res.render("initiatives/read_page.jsx", {
		thank: thank,
		thankAgain: thankAgain,
		signature: !signature || signature.hidden ? null : signature,
		subscription: subscription,
		subscriberCount: subscriberCount,
		signatureCount: signatureCount,
		voteOptions: voteOptions,
		image: image,
		files: files,
		comments: comments,
		events: events
	})
})

exports.router.put("/:id", next(function*(req, res) {
	if (req.body.visibility === "public") {
		yield updateInitiativeToPublished(req, res)
	}
	else if (req.body.status === "voting") {
		yield updateInitiativePhaseToSign(req, res)
	}
	else if (req.body.status === "followUp") {
		yield updateInitiativePhaseToParliament(req, res)
	}
	else if (isInitiativeUpdate(req.body)) {
		var initiative = req.initiative
		var topic = req.topic
		if (!Topic.canEdit(topic)) throw new HttpError(403, "No Permission To Edit")
		yield initiativesDb.update(topic.id, parseInitiative(initiative, req.body))
		res.flash("notice", req.t("INITIATIVE_INFO_UPDATED"))
		res.redirect(303, req.headers.referer || req.baseUrl + req.url)
	}
	else throw new HttpError(422, "Invalid Attribute")
}))

exports.router.delete("/:id", next(function*(req, res) {
	var topic = req.topic

	if (!Topic.canDelete(topic))
		throw new HttpError(405, "Can Only Delete Discussions")

	yield req.cosApi(`/api/users/self/topics/${topic.id}`, {method: "DELETE"})
	res.flash("notice", req.t("INITIATIVE_DELETED"))
	res.redirect(302, req.baseUrl)
}))

exports.router.get("/:id/edit", next(function*(req, res) {
	var topic = req.topic
	if (!Topic.canEdit(topic)) throw new HttpError(401)

	var path = `/api/users/self/topics/${topic.id}`
	var etherpadUrl = yield req.cosApi(path).then((res) => res.body.data.padUrl)

	res.render("initiatives/update_page.jsx", {
		etherpadUrl: serializeEtherpadUrl(etherpadUrl)
	})
}))

exports.router.use("/:id/comments",
	require("./initiatives/comments_controller").router)
exports.router.use("/:id/files",
	require("./initiatives/files_controller").router)
exports.router.use("/:id/events",
	require("./initiatives/events_controller").router)
exports.router.use("/:id/subscriptions",
	require("./initiatives/subscriptions_controller").router)
exports.router.use("/:id/signatures",
	require("./initiatives/signatures_controller").router)

exports.router.use(function(err, req, res, next) {
	if (err instanceof HttpError && err.code === 404) {
		res.statusCode = err.code
		res.statusMessage = err.message

		res.render("error_page.jsx", {
			title: req.t("INITIATIVE_404_TITLE"),
			body: req.t("INITIATIVE_404_BODY")
		})
	}
	else next(err)
})

function* searchRecentInitiatives(initiatives) {
	var recentUuids = _.uniq(_.reverse(_.sortBy(flatten(yield [
		sqlite(sql`
			SELECT initiative_uuid AS uuid, max(created_at) AS at
			FROM comments
			GROUP BY initiative_uuid
			ORDER BY at DESC
			LIMIT 6
		`).then((rows) => rows.map(function(row) {
				row.at = new Date(row.at)
				return row
		})),

		cosDb.query(sql`
			SELECT tv."topicId" AS uuid, max(signature."createdAt") AS at
			FROM "VoteLists" AS signature
			JOIN "TopicVotes" AS tv ON tv."voteId" = signature."voteId"
			GROUP BY tv."topicId"
			ORDER BY at DESC
			LIMIT 6
		`)
	]), "at")).map((row) => row.uuid)).slice(0, 6)

	var initiativesByUuid = _.indexBy(initiatives, "uuid")
	return recentUuids.map((uuid) => initiativesByUuid[uuid]).filter(Boolean)
}

function hasCategory(category, topic) {
	return _.contains(topic.categories, category)
}

function* searchInitiativesEvents(initiatives) {
	var events = yield eventsDb.search(sql`
		SELECT
			event.*,
			user.name AS user_name,

			json_group_array(json_object(
				'id', file.id,
				'name', file.name,
				'title', file.title,
				'url', file.url,
				'content_type', file.content_type,
				'size', length(file.content)
			)) AS files

		FROM initiative_events AS event
		LEFT JOIN initiative_files AS file on file.event_id = event.id
		LEFT JOIN users AS user ON event.user_id = user.id
		WHERE event.initiative_uuid IN ${sql.in(initiatives.map((i) => i.uuid))}
		GROUP BY event.id
		ORDER BY "occurred_at" ASC
	`)

	events.forEach(function(ev) {
		ev.files = JSON.parse(ev.files).filter((f) => f.id).map(filesDb.parse)
	})

	var eventsByInitiativeUuid = _.groupBy(events, "initiative_uuid")

	return flatten(initiatives.map(function(initiative) {
		var events = eventsByInitiativeUuid[initiative.uuid] || EMPTY_ARR
		var sentToParliamentAt = initiative.sent_to_parliament_at
		var finishedInParliamentAt = initiative.finished_in_parliament_at
		var sentToGovernmentAt = initiative.sent_to_government_at
		var finishedInGovernmentAt = initiative.finished_in_government_at

		return concat(
			sentToParliamentAt ? {
				id: "sent-to-parliament",
				initiative_uuid: initiative.uuid,
				type: "sent-to-parliament",
				updated_at: sentToParliamentAt,
				occurred_at: sentToParliamentAt,
				origin: "system"
			} : EMPTY_ARR,

			_.map(initiative.signature_milestones, (at, milestone) => ({
				id: "milestone-" + milestone,
				initiative_uuid: initiative.uuid,
				type: "signature-milestone",
				content: milestone,
				updated_at: at,
				occurred_at: at,
				origin: "system"
			})),

			events,

			(
				finishedInParliamentAt &&
				!events.some((ev) => ev.type == "parliament-finished")
			) ? {
				id: "parliament-finished",
				initiative_uuid: initiative.uuid,
				updated_at: finishedInParliamentAt,
				occurred_at: finishedInParliamentAt,
				type: "parliament-finished",
				origin: "system"
			} : EMPTY_ARR,

			sentToGovernmentAt ? {
				id: "sent-to-government",
				initiative_uuid: initiative.uuid,
				type: "sent-to-government",
				updated_at: sentToGovernmentAt,
				occurred_at: sentToGovernmentAt,
				origin: "system"
			} : EMPTY_ARR,

			finishedInGovernmentAt ? {
				id: "finished-in-government",
				initiative_uuid: initiative.uuid,
				updated_at: finishedInGovernmentAt,
				occurred_at: finishedInGovernmentAt,
				type: "finished-in-government",
				origin: "system"
			} : EMPTY_ARR
		)
	}))
}

function readCitizenSignature(topic, userUuid) {
	return cosDb.query(sql`
		SELECT signature.*, opt.value AS support
		FROM "VoteLists" AS signature
		JOIN "VoteOptions" AS opt ON opt.id = signature."optionId"
		WHERE signature."userId" = ${userUuid}
		AND signature."voteId" = ${topic.vote.id}
		ORDER BY signature."createdAt" DESC
		LIMIT 1
	`).then(_.first)
}

function readTopicPermission(user, topic) {
	if (user == null) return Promise.resolve("read")

	var userUuid = _.serializeUuid(user.uuid)
	if (topic.creatorId == userUuid) return Promise.resolve("admin")

	return cosDb.query(sql`
		SELECT level FROM "TopicMemberUsers"
		WHERE "topicId" = ${topic.id}
		AND "userId" = ${userUuid}
		AND "deletedAt" IS NULL
	`).then(_.first).then((perm) => perm ? perm.level : null)
}

function* searchInitiativeComments(initiativeUuid) {
	var comments = yield commentsDb.search(sql`
		SELECT comment.*, user.name AS user_name
		FROM comments AS comment
		JOIN users AS user ON comment.user_id = user.id
		WHERE comment.initiative_uuid = ${initiativeUuid}
		ORDER BY comment.created_at
	`)

	var parentsAndReplies = _.partition(comments, (c) => c.parent_id == null)
	var parentsById = _.indexBy(parentsAndReplies[0], "id")

	parentsAndReplies[1].forEach(function(comment) {
		var parent = parentsById[comment.parent_id]
		;(parent.replies || (parent.replies = [])).push(comment)
	})

	return parentsAndReplies[0]
}

function isInitiativeUpdate(obj) {
	return (
		"destination" in obj ||
		"author_url" in obj ||
		"url" in obj ||
		"community_url" in obj ||
		"organizations" in obj ||
		"media_urls" in obj ||
		"meetings" in obj ||
		"government_change_urls" in obj ||
		"public_change_urls" in obj ||
		"notes" in obj
	)
}

function* updateInitiativeToPublished(req, res) {
	var topic = req.topic
	var tmpl = "initiatives/update_for_publish_page.jsx"

	if (!(
		Topic.canPublish(topic) ||
		Topic.canUpdateDiscussionDeadline(topic)
	)) throw new HttpError(403)

	if (req.body.endsAt == null) return void res.render(tmpl, {
		attrs: {endsAt: topic.endsAt && new Date(topic.endsAt)}
	})

	let endsAt = DateFns.endOfDay(Time.parseDate(req.body.endsAt))

	if (!Topic.isDeadlineOk(new Date, endsAt)) {
		res.statusCode = 422
		res.statusMessage = "Deadline Too Near or Too Far"

		return void res.render(tmpl, {
			error: req.t("DEADLINE_ERR", {days: Config.minDeadlineDays}),
			attrs: {endsAt: endsAt}
		})
	}

	var attrs = {visibility: "public", endsAt: endsAt}

	var updated = yield req.cosApi(`/api/users/self/topics/${topic.id}`, {
		method: "PUT",
		json: attrs
	}).catch(catch400)

	if (!isOk(updated)) return void res.status(422).render(tmpl, {
		error: translateCitizenError(req.t, updated.body),
		attrs: attrs
	})

	yield initiativesDb.update(topic.id, {discussion_end_email_sent_at: null})

	res.flash("notice", req.t("PUBLISHED_INITIATIVE"))
	res.redirect(303, req.baseUrl + "/" + topic.id)
}

function* updateInitiativePhaseToSign(req, res) {
	var initiative = req.initiative
	var topic = req.topic
	var tmpl = "initiatives/update_for_voting_page.jsx"

	if (!(
		Topic.canPropose(new Date, topic) ||
		Topic.canUpdateVoteDeadline(topic)
	)) throw new HttpError(403, "Cannot Update to Sign Phase")

	if (req.body.endsAt == null) return void res.render(tmpl, {
		attrs: {endsAt: topic.vote ? new Date(topic.vote.endsAt) : null}
	})

	let endsAt = DateFns.endOfDay(Time.parseDate(req.body.endsAt))
	var attrs = {endsAt: endsAt}

	if (!Topic.isDeadlineOk(new Date, endsAt)) {
		res.statusCode = 422
		res.statusMessage = "Deadline Too Near or Too Far"

		return void res.render(tmpl, {
			error: req.t("DEADLINE_ERR", {days: Config.minDeadlineDays}),
			attrs: attrs
		})
	}

	var updated
	var path = `/api/users/self/topics/${topic.id}`

	if (topic.vote)
		updated = req.cosApi(`${path}/votes/${topic.vote.id}`, {
			method: "PUT",
			json: {endsAt: endsAt}
		})
	else
		updated = req.cosApi(`${path}/votes`, {
			method: "POST",
			json: {
				endsAt: endsAt,
				authType: "hard",
				voteType: "regular",
				delegationIsAllowed: false,
				options: [{value: "Yes"}, {value: "No"}]
			}
		})

	updated = yield updated.catch(catch400)

	if (!isOk(updated)) return void res.status(422).render(tmpl, {
		error: translateCitizenError(req.t, updated.body),
		attrs: attrs
	})

	yield initiativesDb.update(initiative, {
		phase: "sign",
		signing_end_email_sent_at: null,

		// Is there a chance for a race condition as Etherpad may not have saved
		// the latest state to the CitizenOS datbase?
		text: topic.description,
		text_type: new MediaType("text/html"),
		text_sha256: sha256(topic.description)
	})

	if (topic.vote == null) {
		var message = yield messagesDb.create({
			initiative_uuid: topic.id,
			origin: "status",
			created_at: new Date,
			updated_at: new Date,

			title: t("SENT_TO_SIGNING_MESSAGE_TITLE", {
				initiativeTitle: topic.title
			}),

			text: renderEmail("et", "SENT_TO_SIGNING_MESSAGE_BODY", {
				initiativeTitle: topic.title,
				initiativeUrl: `${Config.url}/initiatives/${topic.id}`,
			})
		})

		yield Subscription.send(
			message,

			yield subscriptionsDb.searchConfirmedByInitiativeIdForOfficial(
				topic.id
			)
		)
	}

	res.flash("notice", req.t("INITIATIVE_SIGN_PHASE_UPDATED"))
	res.redirect(303, req.baseUrl + "/" + topic.id)
}

function* updateInitiativePhaseToParliament(req, res) {
	var topic = req.topic
	var initiative = req.initiative
	var signatureCount = yield countSignaturesById(initiative.uuid)
	var tmpl = "initiatives/update_for_parliament_page.jsx"

	if (initiative.destination != "parliament")
		throw new HttpError(403, "Cannot Send Local Initiative to Parliament")

	if (!Topic.canSendToParliament(topic, initiative, signatureCount))
		throw new HttpError(403, "Cannot Send to Parliament")

	var attrs = {
		status: req.body.status,
		contact: req.body.contact || EMPTY_CONTACT
	}

	if (req.body.contact == null) return void res.render(tmpl, {attrs: attrs})

	var updated = yield req.cosApi(`/api/users/self/topics/${topic.id}`, {
		method: "PUT",
		json: attrs
	}).catch(catch400)

	if (!isOk(updated)) return void res.status(422).render(tmpl, {
		error: translateCitizenError(req.t, updated.body),
		attrs: attrs
	})

	initiative = yield initiativesDb.update(initiative, {
		phase: "parliament",
		sent_to_parliament_at: new Date,
		parliament_token: Crypto.randomBytes(12)
	})

	var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
	var signaturesUrl = `${initiativeUrl}/signatures.asice?` + Qs.stringify({
		"parliament-token": initiative.parliament_token.toString("hex")
	})

	var uuid = initiative.uuid
	var undersignedSignatureCount = yield countUndersignedSignaturesById(uuid)

	if (undersignedSignatureCount > 0) yield sendEmail({
		to: Config.parliamentEmail,

		subject: t("EMAIL_INITIATIVE_TO_PARLIAMENT_TITLE", {
			initiativeTitle: topic.title
		}),

		text: renderEmail("et", "EMAIL_INITIATIVE_TO_PARLIAMENT_BODY", {
			initiativeTitle: topic.title,
			initiativeUrl: initiativeUrl,
			initiativeUuid: initiative.uuid,

			signatureCount: undersignedSignatureCount,
			signaturesUrl: signaturesUrl,

			authorName: attrs.contact.name,
			authorEmail: attrs.contact.email,
			authorPhone: attrs.contact.phone,
		})
	})

	var message = yield messagesDb.create({
		initiative_uuid: topic.id,
		origin: "status",
		created_at: new Date,
		updated_at: new Date,

		title: t("SENT_TO_PARLIAMENT_MESSAGE_TITLE", {
			initiativeTitle: topic.title
		}),

		text: renderEmail("et", "SENT_TO_PARLIAMENT_MESSAGE_BODY", {
			authorName: attrs.contact.name,
			initiativeTitle: topic.title,
			initiativeUrl: `${Config.url}/initiatives/${topic.id}`,
			signatureCount: signatureCount
		})
	})

	yield Subscription.send(
		message,
		yield subscriptionsDb.searchConfirmedByInitiativeIdForOfficial(topic.id)
	)

	res.flash("notice", req.t("SENT_TO_PARLIAMENT_CONTENT"))
	res.redirect(303, req.baseUrl + "/" + topic.id)
}

function parseInitiative(initiative, obj) {
	var attrs = {}

	if ("destination" in obj && initiative.phase == "edit") {
		var dest = obj.destination || null

		if (!(dest == null || dest == "parliament" || dest in LOCAL_GOVERNMENTS))
			throw new HttpError(422, "Destination Invalid")

		attrs.destination = dest
	}

	if ("author_url" in obj) attrs.author_url = String(obj.author_url).trim()
	if ("url" in obj) attrs.url = String(obj.url).trim()
	if ("notes" in obj) attrs.notes = String(obj.notes).trim()

	if ("community_url" in obj)
		attrs.community_url = String(obj.community_url).trim()

	if ("organizations" in obj) attrs.organizations =
		obj.organizations.map(parseOrganization).filter(isOrganizationPresent)

	if ("meetings" in obj) attrs.meetings =
		obj.meetings.map(parseMeeting).filter(isMeetingPresent)

	if ("media_urls" in obj) attrs.media_urls =
		obj.media_urls.map(String).map(trim).filter(Boolean)

	if ("government_change_urls" in obj) attrs.government_change_urls =
		obj.government_change_urls.map(String).map(trim).filter(Boolean)

	if ("public_change_urls" in obj) attrs.public_change_urls =
		obj.public_change_urls.map(String).map(trim).filter(Boolean)

	return attrs
}

function serializeApiInitiative(initiative, signatureCount) {
	return {
		id: initiative.uuid,
		title: initiative.title,
		phase: initiative.phase,
		signatureCount: signatureCount
	}
}

function parseOrganization(obj) {
	return {
		name: String(obj.name || "").trim(),
		url: String(obj.url || "").trim()
	}
}

function parseMeeting(obj) {
	return {
		date: String(obj.date || "").trim(),
		url: String(obj.url || "").trim()
	}
}

function serializeEtherpadUrl(url) {
	if (Config.etherpadUrl) url = Config.etherpadUrl + Url.parse(url).path
	return url + (url.indexOf("?") >= 0 ? "&" : "?") + "theme=" + ENV
}

function isOrganizationPresent(org) { return org.name || org.url }
function isMeetingPresent(org) { return org.date || org.url }

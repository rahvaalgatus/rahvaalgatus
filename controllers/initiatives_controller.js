var _ = require("root/lib/underscore")
var O = require("oolong")
var Url = require("url")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var Topic = require("root/lib/topic")
var DateFns = require("date-fns")
var Time = require("root/lib/time")
var Config = require("root/config")
var MediaType = require("medium-type")
var Subscription = require("root/lib/subscription")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var filesDb = require("root/db/initiative_files_db")
var commentsDb = require("root/db/comments_db")
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var catch401 = require("root/lib/fetch").catch.bind(null, 401)
var next = require("co-next")
var sleep = require("root/lib/promise").sleep
var cosDb = require("root").cosDb
var cosApi = require("root/lib/citizenos_api")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var renderEmail = require("root/lib/i18n").email
var sql = require("sqlate")
var sqlite = require("root").sqlite
var translateCitizenError = require("root/lib/citizenos_api").translateError
var searchTopics = require("root/lib/citizenos_db").searchTopics
var countSignaturesById = require("root/lib/citizenos_db").countSignaturesById
var countSignaturesByIds = require("root/lib/citizenos_db").countSignaturesByIds
var readVoteOptions = require("root/lib/citizenos_db").readVoteOptions
var concat = Array.prototype.concat.bind(Array.prototype)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var decodeBase64 = require("root/lib/crypto").decodeBase64
var trim = Function.call.bind(String.prototype.trim)
var ENV = process.env.ENV
var EMPTY = Object.prototype
var EMPTY_ARR = Array.prototype
var EMPTY_INITIATIVE = {title: ""}
var EMPTY_CONTACT = {name: "", email: "", phone: ""}

var RESPONSE_TYPES = [
	"text/html",
	"application/vnd.rahvaalgatus.initiative+json; v=1",
	"application/atom+xml"
]

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res) {
	var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

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
		created_at: new Date
	})

	res.redirect(303, req.baseUrl + "/" + topic.id + "/edit")
}))

exports.router.get("/new", function(_req, res) {
	res.render("initiatives/create_page.jsx", {attrs: EMPTY_INITIATIVE})
})

exports.router.use("/:id", next(function*(req, res, next) {
	var initiative = yield initiativesDb.read(req.params.id)
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

	req.topic = topic
	req.initiative = initiative
	res.locals.topic = topic
	res.locals.initiative = initiative
	next()
}))

exports.router.get("/:id",
	new ResponseTypeMiddeware(RESPONSE_TYPES.map(MediaType)),
	next(function*(req, res, next) {
	var initiative = req.initiative

	switch (res.contentType.name) {
		case "application/vnd.rahvaalgatus.initiative+json":
			res.setHeader("Content-Type", res.contentType)
			res.setHeader("Access-Control-Allow-Origin", "*")
			var sigs = yield countSignaturesById(initiative.uuid)
			res.send({title: initiative.title, signatureCount: sigs})
			break

		case "application/atom+xml":
			var events = yield searchInitiativeEvents(initiative)
			res.setHeader("Content-Type", res.contentType)
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
	var thank = false
	var thankAgain = false
	var signature

	if (initiative.phase == "sign" && newSignatureId) {
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
			user_uuid: null,
			hidden: false
		}
	}
	else if (initiative.phase == "sign" && user) {
		let cosSignature = yield readCitizenSignature(topic, user.id)

		signature = cosSignature && cosSignature.support == "Yes"
			? yield readSignatureWithDefault(initiative.uuid, user.id)
			: null
	}

	var subscriberCount =
		yield subscriptionsDb.countConfirmedByInitiativeId(initiative.uuid)

	var comments = yield searchInitiativeComments(initiative.uuid)
	var events = _.reverse(yield searchInitiativeEvents(initiative))

	var subscription = user && user.emailIsVerified
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

	res.render("initiatives/read_page.jsx", {
		thank: thank,
		thankAgain: thankAgain,
		signature: !signature || signature.hidden ? null : signature,
		subscription: subscription,
		subscriberCount: subscriberCount,
		signatureCount: signatureCount,
		voteOptions: voteOptions,
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
		var topic = req.topic
		if (!Topic.canEdit(topic)) throw new HttpError(403, "No Permission To Edit")
		yield initiativesDb.update(topic.id, parseInitiative(req.body))
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
exports.router.use("/:id/authors",
	require("./initiatives/authors_controller").router)
exports.router.use("/:id/files",
	require("./initiatives/files_controller").router)
exports.router.use("/:id/events",
	require("./initiatives/events_controller").router)
exports.router.use("/:id/subscriptions",
	require("./initiatives/subscriptions_controller").router)

exports.router.get("/:id/signable", next(function*(req, res) {
	var topic = req.topic
	var vote = topic.vote

	// NOTE: Do not send signing requests through the current user. See below for
	// an explanation.
	var signable = yield cosApi(`/api/topics/${topic.id}/votes/${vote.id}`, {
		method: "POST",

		json: {
			options: [{optionId: req.query.optionId}],
			certificate: req.query.certificate
		}
	}).catch(catch400)

	if (isOk(signable)) res.json({
		token: signable.body.data.token,
		digest: signable.body.data.signedInfoDigest,
		hash: signable.body.data.signedInfoHashType
	})
	else res.status(422).json({
		error: translateCitizenError(req.t, signable.body)
	})
}))

exports.router.post("/:id/signature", next(function*(req, res) {
	var path
	var topic = req.topic
	var vote = topic.vote

	res.locals.method = req.body.method

	// NOTE: Do not send signing requests through the current user. CitizenOS API
	// limits signing with one personal id number to a single account,
	// a requirement we don't need to enforce.
	switch (req.body.method) {
		case "id-card":
			path = `/api/topics/${topic.id}/votes/${vote.id}/sign`
			var signed = yield cosApi(path, {
				method: "POST",
				json: {token: req.body.token, signatureValue: req.body.signature}
			}).catch(catch400)

			if (isOk(signed)) {
				var userId = parseUserIdFromBdocUrl(signed.body.data.bdocUri)
				var sig = yield readCitizenSignature(topic, userId)
				yield unhideSignature(topic.id, userId)
				res.flash("signatureId", sig.id)
				res.redirect(303, req.baseUrl + "/" + topic.id)
			}
			else res.status(422).render("initiatives/signature/create_page.jsx", {
				error: translateCitizenError(req.t, signed.body)
			})
			break

		case "mobile-id":
			path = `/api/topics/${topic.id}/votes/${vote.id}`
			var signing = yield cosApi(path, {
				method: "POST",
				json: {
					options: [{optionId: req.body.optionId}],
					pid: req.body.pid,
					phoneNumber: ensureAreaCode(req.body.phoneNumber),
				}
			}).catch(catch400)

			if (isOk(signing)) {
				res.render("initiatives/signature/create_page.jsx", {
					code: signing.body.data.challengeID,
					poll: req.baseUrl + req.path + "?token=" + signing.body.data.token
				})
			}
			else res.status(422).render("initiatives/signature/create_page.jsx", {
				error: translateCitizenError(req.t, signing.body)
			})
			break

		default: throw new HttpError(422, "Unknown Signing Method")
	}
}))

exports.router.put("/:id/signature", next(function*(req, res) {
	var user = req.user
	if (user == null) throw new HttpError(401)

	var initiative = req.initiative
	var topic = req.topic

	// NOTE: Do not answer differently if there was no signature or it was already
	// hidden — that'd permit detecting its visibility without actually
	// re-signing.
	var cosSignature = yield readCitizenSignature(topic, user.id)

	if (cosSignature && cosSignature.support == "Yes") {
		var signature = yield signaturesDb.read(sql`
			SELECT * FROM initiative_signatures
			WHERE (initiative_uuid, user_uuid) = (${initiative.uuid}, ${user.id})
		`)

		if (!signature) yield signaturesDb.create({
			initiative_uuid: initiative.uuid,
			user_uuid: user.id,
			hidden: true,
			updated_at: new Date
		})
		else if (!signature.hidden) yield signaturesDb.execute(sql`
			UPDATE initiative_signatures
			SET hidden = 1, updated_at = ${new Date}
			WHERE (initiative_uuid, user_uuid) = (${topic.id}, ${user.id})
		`)
	}

	res.flash("notice", req.t("SIGNATURE_HIDDEN"))
	res.redirect(303, req.baseUrl + "/" + initiative.uuid)
}))

exports.router.get("/:id/signature", next(function*(req, res) {
	var token = req.query.token
	if (token == null) throw new HttpError(400, "Missing Token")
	var topic = req.topic
	var signature = yield readCitizenSignatureWithToken(topic, token)

	switch (signature.statusCode) {
		case 200:
			var userId = parseUserIdFromBdocUrl(signature.body.data.bdocUri)
			var sig = yield readCitizenSignature(topic, userId)
			yield unhideSignature(topic.id, userId)
			res.flash("signatureId", sig.id)
			break

		default:
			res.flash("error", translateCitizenError(req.t, signature.body))
			break
	}

	res.redirect(303, req.baseUrl + "/" + topic.id)
}))

exports.router.use(function(err, req, res, next) {
	if (err instanceof HttpError && err.code === 404) {
		res.statusCode = err.code

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

function* readCitizenSignatureWithToken(topic, token) {
	var vote = topic.vote
	var path = `/api/topics/${topic.id}/votes/${vote.id}/status`
	path += "?token=" + encodeURIComponent(token)

	RETRY: for (var i = 0; i < 60; ++i) {
		// The signature endpoint is valid only for a limited amount of time.
		// If that time passes, 401 is thrown.
		var res = yield cosApi(path).catch(catch400).catch(catch401)

		switch (res.statusCode) {
			case 200:
				if (res.body.status.code === 20001) {
					yield sleep(2500);
					continue RETRY;
				}
				// Fall through.

			default: return res
		}
	}

	throw new HttpError(500, "Mobile-Id Took Too Long")
}

function ensureAreaCode(number) {
	// Numbers without a leading "+" but with a suitable area code, like
	// 37200000766, seem to work.
	if (/^\+/.exec(number)) return number
	if (/^37[012]/.exec(number)) return number
	return "+372" + number
}

function hasCategory(category, topic) {
	return _.contains(topic.categories, category)
}

function parseUserIdFromBdocUrl(url) {
	url = Url.parse(url, true)
	return parseJwt(url.query.token).userId
}

function unhideSignature(initiativeUuid, userId) {
	return signaturesDb.execute(sql`
		UPDATE initiative_signatures
		SET hidden = 0, updated_at = ${new Date}
		WHERE (initiative_uuid, user_uuid) = (${initiativeUuid}, ${userId})
	`)
}

function* searchInitiativeEvents(initiative) {
	var events = yield eventsDb.search(sql`
		SELECT
			event.*,

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
		WHERE event.initiative_uuid = ${initiative.uuid}
		GROUP BY event.id
		ORDER BY "occurred_at" ASC
	`)

	events.forEach(function(ev) {
		ev.files = JSON.parse(ev.files).filter((f) => f.id).map(filesDb.parse)
	})

	var sentToParliamentAt = initiative.sent_to_parliament_at
	var finishedInParliamentAt = initiative.finished_in_parliament_at
	var sentToGovernmentAt = initiative.sent_to_government_at
	var finishedInGovernmentAt = initiative.finished_in_government_at

	events = _.sortBy(concat(
		sentToParliamentAt ? {
			id: "sent-to-parliament",
			type: "sent-to-parliament",
			updated_at: sentToParliamentAt,
			occurred_at: sentToParliamentAt,
			origin: "system"
		} : EMPTY_ARR,

		_.map(initiative.signature_milestones, (at, milestone) => ({
			id: "milestone-" + milestone,
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
			updated_at: finishedInParliamentAt,
			occurred_at: finishedInParliamentAt,
			type: "parliament-finished",
			origin: "system"
		} : EMPTY_ARR,

		sentToGovernmentAt ? {
			id: "sent-to-government",
			type: "sent-to-government",
			updated_at: sentToGovernmentAt,
			occurred_at: sentToGovernmentAt,
			origin: "system"
		} : EMPTY_ARR,

		finishedInGovernmentAt ? {
			id: "finished-in-government",
			updated_at: finishedInGovernmentAt,
			occurred_at: finishedInGovernmentAt,
			type: "finished-in-government",
			origin: "system"
		} : EMPTY_ARR
	), "occurred_at")

	var eventsFromAuthor = events.filter((ev) => ev.origin == "author")

	var users = _.indexBy(yield cosDb.query(sql`
		SELECT id, name FROM "Users"
		WHERE id IN ${sql.in(eventsFromAuthor.map((ev) => ev.created_by))}
	`), "id")

	eventsFromAuthor.forEach((ev) => ev.user = users[ev.created_by])

	return events
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

function readSignatureWithDefault(initiativeUuid, userUuid) {
	return signaturesDb.read(sql`
		SELECT * FROM initiative_signatures
		WHERE (initiative_uuid, user_uuid) = (${initiativeUuid}, ${userUuid})
	`).then((signature) => (signature || {
		initiative_uuid: initiativeUuid,
		user_uuid: userUuid,
		hidden: false
	}))
}

function readTopicPermission(user, topic) {
	if (user == null) return Promise.resolve("read")
	if (topic.creatorId == user.id) return Promise.resolve("admin")

	return cosDb.query(sql`
		SELECT level FROM "TopicMemberUsers"
		WHERE "topicId" = ${topic.id}
		AND "userId" = ${user.id}
		AND "deletedAt" IS NULL
	`).then(_.first).then((perm) => perm ? perm.level : null)
}

function* searchInitiativeComments(initiativeUuid) {
	var comments = yield commentsDb.search(sql`
		SELECT * FROM comments
		WHERE initiative_uuid = ${initiativeUuid}
		ORDER BY created_at
	`)

	var usersById = comments.length > 0 ? _.indexBy(yield cosDb.query(sql`
		SELECT id, name FROM "Users"
		WHERE id IN ${sql.in(comments.map((c) => c.user_uuid))}
	`), "id") : EMPTY

	comments.forEach((comment) => comment.user = usersById[comment.user_uuid])

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

	yield initiativesDb.update(topic.id, {
		phase: "sign",
		signing_end_email_sent_at: null
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

	yield initiativesDb.update(topic.id, {
		phase: "parliament",
		sent_to_parliament_at: new Date
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

		yield subscriptionsDb.searchConfirmedByInitiativeIdForOfficial(
			topic.id
		)
	)

	res.flash("notice", req.t("SENT_TO_PARLIAMENT_CONTENT"))
	res.redirect(303, req.baseUrl + "/" + topic.id)
}

function parseInitiative(obj) {
	var attrs = {}

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

// NOTE: Use this only on JWTs from trusted sources as it does no validation.
function parseJwt(jwt) { return JSON.parse(decodeBase64(jwt.split(".")[1])) }
function isOrganizationPresent(org) { return org.name || org.url }
function isMeetingPresent(org) { return org.date || org.url }

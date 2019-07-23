var _ = require("root/lib/underscore")
var O = require("oolong")
var Url = require("url")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var Initiative = require("root/lib/initiative")
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
var countSignatures = Initiative.countSignatures.bind(null, "Yes")
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var catch401 = require("root/lib/fetch").catch.bind(null, 401)
var isFetchError = require("root/lib/fetch").is
var next = require("co-next")
var sleep = require("root/lib/promise").sleep
var cosDb = require("root").cosDb
var cosApi = require("root/lib/citizenos_api")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var renderEmail = require("root/lib/i18n").email
var sql = require("sqlate")
var parseCitizenInitiative = cosApi.parseCitizenInitiative
var encode = encodeURIComponent
var translateCitizenError = require("root/lib/citizenos_api").translateError
var hasMainPartnerId = Initiative.hasPartnerId.bind(null, Config.apiPartnerId)
var searchInitiatives = require("root/lib/citizenos_db").searchInitiatives
var concat = Array.prototype.concat.bind(Array.prototype)
var decodeBase64 = require("root/lib/crypto").decodeBase64
var trim = Function.call.bind(String.prototype.trim)
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
	var initiatives = yield searchInitiatives()
	var category = req.query.category

	if (category)
		initiatives = initiatives.filter(hasCategory.bind(null, category))

	var uuids = initiatives.map((i) => i.id)
	var dbInitiatives = yield initiativesDb.search(uuids, {create: true})
	dbInitiatives = _.indexBy(dbInitiatives, "uuid")

	initiatives = _.groupBy(initiatives, "status")

	var closed = _.groupBy(initiatives.closed || [], (initiative) => (
		Initiative.getUnclosedStatus(initiative, dbInitiatives[initiative.id])
	))

	var votings = concat(
		initiatives.voting || EMPTY_ARR,
		closed.voting || EMPTY_ARR
	)

	res.render("initiatives_page.jsx", {
		discussions: concat(
			sortByCreatedAt(initiatives.inProgress || [], "createdAt").reverse(),
			sortByCreatedAt((closed.inProgress || []).filter(hasMainPartnerId))
		),

		votings: _.sortBy(votings, countSignatures).reverse(),

		processes: _.sortBy(initiatives.followUp, function(initiative) {
			var dbInitiative = dbInitiatives[initiative.id]
			return dbInitiative.sent_to_parliament_at || initiative.vote.createdAt
		}).reverse(),

		processed: _.sortBy(closed.followUp || [], function(initiative) {
			var dbInitiative = dbInitiatives[initiative.id]
			return dbInitiative.finished_in_parliament_at || initiative.vote.createdAt
		}).reverse(),

		dbInitiatives: dbInitiatives
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
	var initiative
	var dbInitiative = yield initiativesDb.read(req.params.id)
	if (dbInitiative == null) throw new HttpError(404)

	if (dbInitiative.external) initiative = {
		id: dbInitiative.uuid,
		title: dbInitiative.title,
		creator: {name: dbInitiative.author_name},
		createdAt: dbInitiative.created_at,
		permission: {level: "read"},
		visibility: "public",
		status: "followUp",

		vote: {
			createdAt: dbInitiative.created_at,
			options: {rows: [{value: "Yes", voteCount: Config.votesRequired}]}
		}
	}
	else {
		try {
			var path = `/api/topics/${encode(req.params.id)}`
			path += "?include[]=vote&include[]=event"
			if (req.user) path = "/api/users/self" + path.slice(4)

			initiative = yield req.cosApi(path).then(getBody).
				then(parseCitizenInitiative)
		}
		catch (ex) {
			// CitizenOS throws 500 for invalid UUIDs. Workaround that.
			if (isFetchError(403, ex)) throw new HttpError(404)
			if (isFetchError(404, ex)) throw new HttpError(404)
			if (isFetchError(500, ex)) throw new HttpError(404)
			throw ex
		}
	}

	req.initiative = initiative
	req.dbInitiative = dbInitiative
	res.locals.initiative = req.initiative
	res.locals.dbInitiative = req.dbInitiative
	next()
}))

exports.router.get("/:id",
	new ResponseTypeMiddeware(RESPONSE_TYPES.map(MediaType)),
	next(function*(req, res, next) {
	var initiative = req.initiative
	var dbInitiative = req.dbInitiative

	switch (res.contentType.name) {
		case "application/vnd.rahvaalgatus.initiative+json":
			res.setHeader("Content-Type", res.contentType)
			res.setHeader("Access-Control-Allow-Origin", "*")

			res.send({
				title: initiative.title,
				signatureCount: initiative.vote ? countSignatures(initiative) : 0
			})
			break

		case "application/atom+xml":
			var events = yield searchInitiativeEvents(dbInitiative)
			res.setHeader("Content-Type", res.contentType)
			res.render("initiatives/atom.jsx", {events: events})
			break

		default: exports.read(req, res, next)
	}
}))

exports.read = next(function*(req, res) {
	var user = req.user
	var initiative = req.initiative
	var dbInitiative = req.dbInitiative
	var voteId = req.flash("signatureId")

	var votes = voteId ? yield cosDb.query(sql`
		SELECT signature.*, opt.value AS support
		FROM "VoteLists" AS signature
		JOIN "VoteLists" AS signed
		ON signed."voteId" = signature."voteId"
		AND signed."userId" = signature."userId"
		JOIN "VoteOptions" AS opt ON opt.id = signature."optionId"
		WHERE signed.id = ${voteId}
		ORDER BY "createdAt" DESC
		LIMIT 2
	`) : EMPTY_ARR

	var vote = votes[0]

	var signature
	if (user == null && vote && vote.support == "Yes") signature = {
		initiative_uuid: initiative.id,
		user_uuid: null,
		hidden: false
	}
	else if (user && Initiative.hasVote("Yes", initiative)) signature = (
		(yield signaturesDb.read(sql`
			SELECT * FROM initiative_signatures
			WHERE (initiative_uuid, user_uuid) = (${initiative.id}, ${user.id})
		`)) || {
			initiative_uuid: initiative.id,
			user_uuid: user.id,
			hidden: false
		})
	else if (vote && vote.support == "No")
		res.flash("notice", req.t("SIGNATURE_REVOKED"))

	if (signature && signature.hidden) signature = null

	var subscriberCount =
		yield subscriptionsDb.countConfirmedByInitiativeId(initiative.id)

	var comments = yield searchInitiativeComments(initiative.id)
	var events = _.reverse(yield searchInitiativeEvents(dbInitiative))

	var subscription = user && user.emailIsVerified
		? yield subscriptionsDb.read(sql`
			SELECT * FROM initiative_subscriptions
			WHERE initiative_uuid = ${initiative.id}
			AND email = ${user.email}
			LIMIT 1
		`)
		: null

	var files = yield filesDb.search(sql`
		SELECT id, name, title, content_type, length(content) AS size
		FROM initiative_files
		WHERE initiative_uuid = ${dbInitiative.uuid}
		AND event_id IS NULL
	`)

	res.render("initiatives/read_page.jsx", {
		thank: vote && vote.support == "Yes",
		thankAgain: votes.length > 1 && votes[1].support == "Yes",
		signature: signature,
		subscription: subscription,
		subscriberCount: subscriberCount,
		files: files,
		comments: comments,
		events: events
	})
})

exports.router.put("/:id", next(function*(req, res) {
	var initiative = req.initiative

	if (req.body.visibility === "public") {
		yield updateInitiativeToPublished(req, res)
	}
	else if (req.body.status === "voting") {
		yield updateInitiativePhaseToSign(req, res)
	}
	else if (req.body.status === "followUp") {
		yield updateInitiativePhaseToParliament(req, res)
	}
	else if (isDbInitiativeUpdate(req.body)) {
		if (!Initiative.canEdit(initiative)) throw new HttpError(401)
		yield initiativesDb.update(initiative.id, parseInitiative(req.body))
		res.flash("notice", req.t("INITIATIVE_INFO_UPDATED"))
		res.redirect(303, req.headers.referer || req.baseUrl + req.url)
	}
	else throw new HttpError(422, "Invalid Attribute")
}))

exports.router.delete("/:id", next(function*(req, res) {
	var initiative = req.initiative
	if (!Initiative.canDelete(initiative)) throw new HttpError(405)
	yield req.cosApi(`/api/users/self/topics/${initiative.id}`, {method: "DELETE"})
	res.flash("notice", req.t("INITIATIVE_DELETED"))
	res.redirect(302, req.baseUrl)
}))

exports.router.get("/:id/edit", function(req, res) {
	if (!Initiative.canEdit(req.initiative)) throw new HttpError(401)
	res.render("initiatives/update_page.jsx")
})

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
	var initiative = req.initiative
	var vote = initiative.vote

	// NOTE: Do not send signing requests through the current user. See below for
	// an explanation.
	var signable = yield cosApi(`/api/topics/${initiative.id}/votes/${vote.id}`, {
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
	var initiative = req.initiative
	var vote = initiative.vote

	res.locals.method = req.body.method

	// NOTE: Do not send signing requests through the current user. CitizenOS API
	// limits signing with one personal id number to a single account,
	// a requirement we don't need to enforce.
	switch (req.body.method) {
		case "id-card":
			path = `/api/topics/${initiative.id}/votes/${vote.id}/sign`
			var signed = yield cosApi(path, {
				method: "POST",
				json: {token: req.body.token, signatureValue: req.body.signature}
			}).catch(catch400)

			if (isOk(signed)) {
				var userId = parseUserIdFromBdocUrl(signed.body.data.bdocUri)
				var sig = yield searchCitizenSignature(initiative.id, userId)
				yield unhideSignature(initiative.id, userId)
				res.flash("signatureId", sig.id)
				res.redirect(303, req.baseUrl + "/" + initiative.id)
			}
			else res.status(422).render("initiatives/signature/create_page.jsx", {
				error: translateCitizenError(req.t, signed.body)
			})
			break

		case "mobile-id":
			path = `/api/topics/${initiative.id}/votes/${vote.id}`
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
	var initiative = req.initiative
	if (user == null) throw new HttpError(401)

	if (Initiative.hasVote("Yes", initiative)) {
		var signature = yield signaturesDb.read(sql`
			SELECT * FROM initiative_signatures
			WHERE (initiative_uuid, user_uuid) = (${initiative.id}, ${user.id})
		`)

		if (!signature) yield signaturesDb.create({
			initiative_uuid: initiative.id,
			user_uuid: user.id,
			hidden: true,
			updated_at: new Date
		})
		else if (!signature.hidden) yield signaturesDb.execute(sql`
			UPDATE initiative_signatures
			SET hidden = 1, updated_at = ${new Date}
			WHERE (initiative_uuid, user_uuid) = (${initiative.id}, ${user.id})
		`)
	}

	// NOTE: Do not answer differently if there was no signature or it was already
	// hidden — that'd permit detecting its visibility without actually
	// re-signing.
	res.flash("notice", req.t("SIGNATURE_HIDDEN"))
	res.redirect(303, req.baseUrl + "/" + initiative.id)
}))

exports.router.get("/:id/signature", next(function*(req, res) {
	var token = req.query.token
	if (token == null) throw new HttpError(400, "Missing Token")
	var initiative = req.initiative
	var signature = yield readSignature(initiative, token)

	switch (signature.statusCode) {
		case 200:
			var userId = parseUserIdFromBdocUrl(signature.body.data.bdocUri)
			var sig = yield searchCitizenSignature(initiative.id, userId)
			yield unhideSignature(initiative.id, userId)
			res.flash("signatureId", sig.id)
			break

		default:
			res.flash("error", translateCitizenError(req.t, signature.body))
			break
	}

	res.redirect(303, req.baseUrl + "/" + initiative.id)
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

function* readSignature(initiative, token) {
	var vote = initiative.vote
	var path = `/api/topics/${initiative.id}/votes/${vote.id}/status`
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

function hasCategory(category, initiative) {
	return _.contains(initiative.categories, category)
}

function parseUserIdFromBdocUrl(url) {
	url = Url.parse(url, true)
	return parseJwt(url.query.token).userId
}

function unhideSignature(initiativeId, userId) {
	return signaturesDb.execute(sql`
		UPDATE initiative_signatures
		SET hidden = 0, updated_at = ${new Date}
		WHERE (initiative_uuid, user_uuid) = (${initiativeId}, ${userId})
	`)
}

function* searchInitiativeEvents(initiative) {
	var events = yield eventsDb.search(sql`
		SELECT event.*, json_group_array(json_object(
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

	return _.sortBy(concat(
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
			id: "finished-in-parliament",
			updated_at: finishedInParliamentAt,
			occurred_at: finishedInParliamentAt,
			type: "parliament-finished",
			origin: "system"
		} : EMPTY_ARR
	), "occurred_at")
}

function searchCitizenSignature(topicId, userId) {
	return cosDb.query(sql`
		SELECT signature.*
		FROM "VoteLists" AS signature
		JOIN "TopicVotes" AS tv ON tv."topicId" = ${topicId}
		WHERE signature."userId" = ${userId}
		AND signature."voteId" = tv."voteId"
		ORDER BY signature."createdAt" DESC
		LIMIT 1
	`).then(_.first)
}

function* searchInitiativeComments(initiativeId) {
	var comments = yield commentsDb.search(sql`
		SELECT * FROM comments
		WHERE initiative_uuid = ${initiativeId}
		ORDER BY created_at
	`)

	var usersById = comments.length > 0 ? _.indexBy(yield cosDb.query(sql`
		SELECT id, name FROM "Users"
		WHERE id IN ${sql.tuple(comments.map((c) => c.user_uuid))}
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

function isDbInitiativeUpdate(obj) {
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
	var initiative = req.initiative
	var tmpl = "initiatives/update_for_publish_page.jsx"

	if (!(
		Initiative.canPublish(initiative) ||
		Initiative.canUpdateDiscussionDeadline(initiative)
	)) throw new HttpError(401)

	if (req.body.endsAt == null) return void res.render(tmpl, {
		attrs: {endsAt: initiative.endsAt && new Date(initiative.endsAt)}
	})

	let endsAt = DateFns.endOfDay(Time.parseDate(req.body.endsAt))

	if (!Initiative.isDeadlineOk(new Date, endsAt)) return void res.render(tmpl, {
		error: req.t("DEADLINE_ERR", {days: Config.minDeadlineDays}),
		attrs: {endsAt: endsAt}
	})

	var attrs = {visibility: "public", endsAt: endsAt}

	var updated = yield req.cosApi(`/api/users/self/topics/${initiative.id}`, {
		method: "PUT",
		json: attrs
	}).catch(catch400)

	if (!isOk(updated)) return void res.status(422).render(tmpl, {
		error: translateCitizenError(req.t, updated.body),
		attrs: attrs
	})

	yield initiativesDb.update(initiative.id, {
		discussion_end_email_sent_at: null
	})

	res.flash("notice", req.t("PUBLISHED_INITIATIVE"))
	res.redirect(303, req.baseUrl + "/" + initiative.id)
}

function* updateInitiativePhaseToSign(req, res) {
	var initiative = req.initiative
	var tmpl = "initiatives/update_for_voting_page.jsx"

	if (!(
		Initiative.canPropose(new Date, initiative) ||
		Initiative.canUpdateVoteDeadline(initiative)
	)) throw new HttpError(401)

	if (req.body.endsAt == null) return void res.render(tmpl, {
		attrs: {endsAt: initiative.vote ? new Date(initiative.vote.endsAt) : null}
	})

	let endsAt = DateFns.endOfDay(Time.parseDate(req.body.endsAt))
	var attrs = {endsAt: endsAt}

	if (!Initiative.isDeadlineOk(new Date, endsAt))
		return void res.render(tmpl, {
			error: req.t("DEADLINE_ERR", {days: Config.minDeadlineDays}),
			attrs: attrs
		})

	var updated
	var path = `/api/users/self/topics/${initiative.id}`

	if (initiative.vote)
		updated = req.cosApi(`${path}/votes/${initiative.vote.id}`, {
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

	yield initiativesDb.update(initiative.id, {
		phase: "sign",
		signing_end_email_sent_at: null
	})

	if (initiative.vote == null) {
		var message = yield messagesDb.create({
			initiative_uuid: initiative.id,
			origin: "status",
			created_at: new Date,
			updated_at: new Date,

			title: t("SENT_TO_SIGNING_MESSAGE_TITLE", {
				initiativeTitle: initiative.title
			}),

			text: renderEmail("et", "SENT_TO_SIGNING_MESSAGE_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.id}`,
			})
		})

		yield Subscription.send(
			message,

			yield subscriptionsDb.searchConfirmedByInitiativeIdForOfficial(
				initiative.id
			)
		)
	}

	res.flash("notice", req.t("INITIATIVE_SIGN_PHASE_UPDATED"))
	res.redirect(303, req.baseUrl + "/" + initiative.id)
}

function* updateInitiativePhaseToParliament(req, res) {
	var initiative = req.initiative
	var dbInitiative = req.dbInitiative
	var tmpl = "initiatives/update_for_parliament_page.jsx"

	if (!Initiative.canSendToParliament(initiative, dbInitiative))
		throw new HttpError(401)

	var attrs = {
		status: req.body.status,
		contact: req.body.contact || EMPTY_CONTACT
	}

	if (req.body.contact == null) return void res.render(tmpl, {attrs: attrs})

	var updated = yield req.cosApi(`/api/users/self/topics/${initiative.id}`, {
		method: "PUT",
		json: attrs
	}).catch(catch400)

	if (!isOk(updated)) return void res.status(422).render(tmpl, {
		error: translateCitizenError(req.t, updated.body),
		attrs: attrs
	})

	yield initiativesDb.update(initiative.id, {
		phase: "parliament",
		sent_to_parliament_at: new Date
	})

	var message = yield messagesDb.create({
		initiative_uuid: initiative.id,
		origin: "status",
		created_at: new Date,
		updated_at: new Date,

		title: t("SENT_TO_PARLIAMENT_MESSAGE_TITLE", {
			initiativeTitle: initiative.title
		}),

		text: renderEmail("et", "SENT_TO_PARLIAMENT_MESSAGE_BODY", {
			authorName: attrs.contact.name,
			initiativeTitle: initiative.title,
			initiativeUrl: `${Config.url}/initiatives/${initiative.id}`,
			signatureCount: countSignatures(initiative)
		})
	})

	yield Subscription.send(
		message,

		yield subscriptionsDb.searchConfirmedByInitiativeIdForOfficial(
			initiative.id
		)
	)

	res.flash("notice", req.t("SENT_TO_PARLIAMENT_CONTENT"))
	res.redirect(303, req.baseUrl + "/" + initiative.id)
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

// NOTE: Use this only on JWTs from trusted sources as it does no validation.
function parseJwt(jwt) { return JSON.parse(decodeBase64(jwt.split(".")[1])) }
function getBody(res) { return res.body.data }
function sortByCreatedAt(arr) { return _.sortBy(arr, "createdAt").reverse() }
function isOrganizationPresent(org) { return org.name || org.url }
function isMeetingPresent(org) { return org.date || org.url }

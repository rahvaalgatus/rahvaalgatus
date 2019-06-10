var _ = require("root/lib/underscore")
var O = require("oolong")
var Url = require("url")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var Initiative = require("root/lib/initiative")
var DateFns = require("date-fns")
var Config = require("root/config")
var MediaType = require("medium-type")
var Sqlite = require("root/lib/sqlite")
var Http = require("root/lib/http")
var Subscription = require("root/lib/subscription")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var countSignatures = Initiative.countSignatures.bind(null, "Yes")
var parseSubscription =
	require("root/controllers/subscriptions_controller").parse
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var catch401 = require("root/lib/fetch").catch.bind(null, 401)
var isFetchError = require("root/lib/fetch").is
var next = require("co-next")
var sleep = require("root/lib/promise").sleep
var cosApi = require("root/lib/citizenos_api")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var renderEmail = require("root/lib/i18n").email
var sql = require("sqlate")
var parseCitizenInitiative = cosApi.parseCitizenInitiative
var parseCitizenComment = cosApi.parseCitizenComment
var readInitiativesWithStatus = cosApi.readInitiativesWithStatus
var encode = encodeURIComponent
var translateCitizenError = require("root/lib/citizenos_api").translateError
var hasMainPartnerId = Initiative.hasPartnerId.bind(null, Config.apiPartnerId)
var sendEmail = require("root").sendEmail
var concat = Array.prototype.concat.bind(Array.prototype)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var randomHex = require("root/lib/crypto").randomHex
var decodeBase64 = require("root/lib/crypto").decodeBase64
var trim = Function.call.bind(String.prototype.trim)
var EMPTY_ARR = Array.prototype
var EMPTY_INITIATIVE = {title: "", contact: {name: "", email: "", phone: ""}}
var EMPTY_COMMENT = {subject: "", text: "", parentId: null}

var RESPONSE_TYPES = [
	"text/html",
	"application/vnd.rahvaalgatus.initiative+json; v=1",
	"application/atom+xml"
]

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res) {
	var initiatives = yield {
		inProgress: readInitiativesWithStatus("inProgress"),
		voting: readInitiativesWithStatus("voting"),
		followUp: readInitiativesWithStatus("followUp"),
		closed: readInitiativesWithStatus("closed"),
	}

	if (req.query.category) initiatives = O.map(initiatives, (initiatives) => (
		initiatives.filter(hasCategory.bind(null, req.query.category))
	))

	var uuids = flatten(_.values(initiatives)).map((i) => i.id)
	var dbInitiatives = yield initiativesDb.search(uuids, {create: true})
	dbInitiatives = _.indexBy(dbInitiatives, "uuid")

	var closed = _.groupBy(initiatives.closed, (initiative) => (
		Initiative.getUnclosedStatus(initiative, dbInitiatives[initiative.id])
	))

	var votings = concat(initiatives.voting, closed.voting || EMPTY_ARR)

	res.render("initiatives_page.jsx", {
		discussions: concat(
			sortByCreatedAt(initiatives.inProgress, "createdAt").reverse(),
			sortByCreatedAt((closed.inProgress || EMPTY_ARR).filter(hasMainPartnerId))
		),

		votings: _.sortBy(votings, countSignatures).reverse(),

		processes: _.sortBy(initiatives.followUp, function(initiative) {
			var dbInitiative = dbInitiatives[initiative.id]
			return dbInitiative.sent_to_parliament_at || initiative.vote.createdAt
		}).reverse(),

		processed: _.sortBy(closed.followUp || EMPTY_ARR, function(initiative) {
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

	if (isOk(created)) {
		var initiative = created.body.data
		res.redirect(303, req.baseUrl + "/" + initiative.id + "/edit")
	}
	else res.status(422).render("initiatives/create_page.jsx", {
		error: translateCitizenError(req.t, created.body),
		attrs: attrs
	})
}))

exports.router.get("/new", function(_req, res) {
	res.render("initiatives/create_page.jsx", {attrs: EMPTY_INITIATIVE})
})

exports.router.use("/:id", next(function*(req, res, next) {
	try {
		var path = `/api/topics/${encode(req.params.id)}?include[]=vote&include[]=event`
		if (req.user) path = "/api/users/self" + path.slice(4)
		req.initiative = yield req.cosApi(path).then(getBody).
			then(parseCitizenInitiative)

		req.dbInitiative = yield initiativesDb.read(req.initiative.id, {
			create: true
		})
	}
	catch (ex) {
		// CitizenOS throws 500 for invalid UUIDs. Workaround that.
		if (isFetchError(403, ex)) throw new HttpError(404)
		if (isFetchError(404, ex)) throw new HttpError(404)
		if (isFetchError(500, ex)) throw new HttpError(404)
		throw ex
	}

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
			// Stick to the default language in the Atom feed.
			var events = yield searchInitiativeEvents(t, dbInitiative)
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

	var signature
	if (user == null && req.flash("signed")) signature = {
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

	if (signature && signature.hidden) signature = null

	var subscriberCount =
		yield subscriptionsDb.countConfirmedByInitiativeId(initiative.id)

	var commentsPath = `/api/topics/${initiative.id}/comments?orderBy=date`
	if (req.user) commentsPath = "/api/users/self" + commentsPath.slice(4)
	var comments = yield req.cosApi(commentsPath)
	comments = comments.body.data.rows.map(parseCitizenComment).reverse()

	var events = _.reverse(yield searchInitiativeEvents(req.t, dbInitiative))

	res.render("initiatives/read_page.jsx", {
		signature: signature,
		subscriberCount: subscriberCount,
		comments: comments,
		comment: res.locals.comment || EMPTY_COMMENT,
		events: events
	})
})

exports.router.put("/:id", next(function*(req, res) {
	var initiative = req.initiative
	var dbInitiative = req.dbInitiative
	var unclosedStatus = Initiative.getUnclosedStatus(initiative, dbInitiative)
	res.locals.subpage = unclosedStatus == "inProgress" ? "discussion" : "vote"

	var tmpl
	var message
	var method = "PUT"
	var path = `/api/users/self/topics/${initiative.id}`
	var attrs = EMPTY_INITIATIVE

	if (req.body.visibility === "public") {
		tmpl = "initiatives/update_for_publish_page.jsx"
		if (!(
			Initiative.canPublish(initiative) ||
			Initiative.canUpdateDiscussionDeadline(initiative)
		)) throw new HttpError(401)

		if (req.body.endsAt == null) return void res.render(tmpl, {
			attrs: {endsAt: initiative.endsAt && new Date(initiative.endsAt)}
		})

		let endsAt = DateFns.endOfDay(new Date(req.body.endsAt))
		if (!Initiative.isDeadlineOk(new Date, endsAt))
			return void res.render(tmpl, {
				error: req.t("DEADLINE_ERR", {days: Config.minDeadlineDays}),
				attrs: {endsAt: endsAt}
			})

		attrs = {visibility: "public", endsAt: endsAt}
	}
	else if (req.body.status === "voting") {
		tmpl = "initiatives/update_for_voting_page.jsx"
		if (!(
			Initiative.canPropose(new Date, initiative) ||
			Initiative.canUpdateVoteDeadline(initiative)
		)) throw new HttpError(401)

		if (req.body.endsAt == null) return void res.render(tmpl, {
			attrs: {endsAt: initiative.vote ? new Date(initiative.vote.endsAt) : null}
		})

		let endsAt = DateFns.endOfDay(new Date(req.body.endsAt))
		if (!Initiative.isDeadlineOk(new Date, endsAt))
			return void res.render(tmpl, {
				error: req.t("DEADLINE_ERR", {days: Config.minDeadlineDays}),
				attrs: {endsAt: endsAt}
			})

		if (initiative.vote) {
			method = "PUT"
			path += `/votes/${initiative.vote.id}`
			attrs = {endsAt: endsAt}
		}
		else {
			method = "POST"
			path += "/votes"
			attrs = {
				endsAt: endsAt,
				authType: "hard",
				voteType: "regular",
				delegationIsAllowed: false,
				options: [{value: "Yes"}, {value: "No"}]
			}
		}
	}
	else if (req.body.status === "followUp") {
		tmpl = "initiatives/update_for_parliament_page.jsx"
		if (!Initiative.canSendToParliament(initiative, dbInitiative))
			throw new HttpError(401)

		if (req.body.contact == null) return void res.render(tmpl, {attrs: attrs})

		attrs = {
			status: req.body.status,
			contact: O.defaults(req.body.contact, EMPTY_INITIATIVE.contact)
		}
	}
	else if (isDbInitiativeUpdate(req.body)) {
		if (!Initiative.canEdit(initiative)) throw new HttpError(401)
		yield initiativesDb.update(initiative.id, parseInitiative(req.body))
		res.flash("notice", req.t("INITIATIVE_INFO_UPDATED"))
		res.redirect(303, req.headers.referer || req.baseUrl + req.url)
		return
	}
	else throw new HttpError(422, "Invalid Attribute")

	var updated = yield req.cosApi(path, {
		method: method,
		json: attrs
	}).catch(catch400)

	if (isOk(updated)) {
		if (initiative.status == "inProgress" && attrs.endsAt)
			yield initiativesDb.update(initiative.id, {
				discussion_end_email_sent_at: null
			})
		else if (initiative.status == "voting" && attrs.endsAt)
			yield initiativesDb.update(initiative.id, {
				signing_end_email_sent_at: null
			})

		if (req.body.visibility === "public")
			res.flash("notice", "Algatus on nüüd avalik.")
		else if (req.body.status === "voting") {
			if (initiative.vote == null) {
				message = yield messagesDb.create({
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
					yield subscriptionsDb.searchConfirmedByInitiativeId(initiative.id)
				)
			}

			res.flash("notice", "Algatus on avatud allkirjade kogumiseks.")
		}
		else if (req.body.status === "followUp") {
			if (!req.dbInitiative.sent_to_parliament_at)
				yield initiativesDb.update(initiative.id, {
					sent_to_parliament_at: new Date
				})

			message = yield messagesDb.create({
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
				yield subscriptionsDb.searchConfirmedByInitiativeId(initiative.id)
			)

			res.flash("notice", req.t("SENT_TO_PARLIAMENT_CONTENT"))
		}
		else if (req.body.status === "closed")
			res.flash("notice", "Algatuse menetlus on lõpetatud.")

		res.redirect(303, req.baseUrl + "/" + initiative.id)
	}
	else res.status(422).render(tmpl, {
		error: translateCitizenError(req.t, updated.body),
		attrs: attrs
	})
}))

exports.router.delete("/:id", next(function*(req, res) {
	var initiative = req.initiative
	if (!Initiative.canDelete(initiative)) throw new HttpError(405)
	yield req.cosApi(`/api/users/self/topics/${initiative.id}`, {method: "DELETE"})
	res.flash("notice", "Algatus on kustutatud.")
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
exports.router.use("/:id/events",
	require("./initiatives/events_controller").router)

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
				yield unhideSignature(initiative.id, userId)

				res.flash("notice", req.t("THANKS_FOR_SIGNING"))
				res.flash("signed", signed.body.data.bdocUri)
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
			yield unhideSignature(initiative.id, userId)

			// Cannot currently know which option the person signed.
			res.flash("notice", req.t("THANKS_FOR_SIGNING"))
			res.flash("signed", signature.body.data.bdocUri)
			break

		default:
			res.flash("error", translateCitizenError(req.t, signature.body))
			break
	}

	res.redirect(303, req.baseUrl + "/" + initiative.id)
}))

exports.router.use("/:id/subscriptions", function(req, _res, next) {
	var initiative = req.initiative

	if (!Initiative.isPublic(initiative))
		next(new HttpError(403, "Initiative Not Public"))
	else
		next()
})

exports.router.post("/:id/subscriptions", next(function*(req, res) {
	var initiative = req.initiative
	var email = req.body.email

	if (!_.isValidEmail(email))
		return void res.status(422).render("form_error_page.jsx", {
			errors: [req.t("INVALID_EMAIL")]
		})

	var subscription
	try {
		subscription = yield subscriptionsDb.create({
			initiative_uuid: initiative.id,
			email: email,
			confirmation_token: randomHex(8),
			created_at: new Date,
			created_ip: req.ip,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (Sqlite.isUniqueError(ex))
			subscription = yield subscriptionsDb.read(sql`
				SELECT * FROM initiative_subscriptions
				WHERE (initiative_uuid, email) = (${initiative.id}, ${email})
			`)

		else throw ex
	}

	if (
		subscription.confirmation_sent_at == null ||
		new Date - subscription.confirmation_sent_at >= 3600 * 1000
	) {
		var initiativeUrl = Http.link(req, req.baseUrl + "/" + initiative.id)

		if (subscription.confirmed_at) {
			yield sendEmail({
				to: email,

				subject: req.t("ALREADY_SUBSCRIBED_TO_INITIATIVE_TITLE", {
					initiativeTitle: initiative.title
				}),

				text: renderEmail(req.lang, "ALREADY_SUBSCRIBED_TO_INITIATIVE_BODY", {
					url: initiativeUrl + "/subscriptions/" + subscription.update_token,
					initiativeTitle: initiative.title,
					initiativeUrl: initiativeUrl
				})
			})
		}
		else {
			var token = subscription.confirmation_token

			yield sendEmail({
				to: email,

				subject: req.t("CONFIRM_INITIATIVE_SUBSCRIPTION_TITLE", {
					initiativeTitle: initiative.title
				}),

				text: renderEmail(req.lang, "CONFIRM_INITIATIVE_SUBSCRIPTION_BODY", {
					url: initiativeUrl + "/subscriptions/new?confirmation_token=" + token,
					initiativeTitle: initiative.title,
					initiativeUrl: initiativeUrl
				})
			})
		}

		yield subscriptionsDb.update(subscription, {
			confirmation_sent_at: new Date,
			updated_at: new Date
		})
	}

	res.flash("notice", req.t("CONFIRM_INITIATIVE_SUBSCRIPTION"))
	res.redirect(303, req.baseUrl + "/" + initiative.id)
}))

exports.router.get("/:id/subscriptions/new", next(function*(req, res, next) {
	var initiative = req.initiative

	var subscription = yield subscriptionsDb.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.id}
		AND confirmation_token = ${req.query.confirmation_token}
		LIMIT 1
	`)

	if (subscription) {
		if (!subscription.confirmed_at)
			yield subscriptionsDb.update(subscription, {
				confirmed_at: new Date,
				confirmation_sent_at: null,
				updated_at: new Date
			})
		
		res.flash("notice", req.t("CONFIRMED_INITIATIVE_SUBSCRIPTION"))
		res.redirect(303, req.baseUrl + "/" + initiative.id)
	}
	else {
		res.statusCode = 404
		res.statusMessage = "Invalid Confirmation Token"
		res.flash("error",
			req.t("INVALID_INITIATIVE_SUBSCRIPTION_CONFIRMATION_TOKEN"))

		exports.read(req, res, next)
	}
}))

exports.router.use("/:id/subscriptions/:token", next(function*(req, res, next) {
	req.subscription = yield subscriptionsDb.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${req.initiative.id}
		AND update_token = ${req.params.token}
		LIMIT 1
	`)

	if (req.subscription) return void next()

	res.statusCode = 404

	return void res.render("error_page.jsx", {
		title: req.t("SUBSCRIPTION_NOT_FOUND_TITLE"),
		body: req.t("SUBSCRIPTION_NOT_FOUND_BODY")
	})
}))

exports.router.get("/:id/subscriptions/:token", function(req, res) {
	res.render("initiatives/subscriptions/read_page.jsx", {
		subscription: req.subscription
	})
})

exports.router.put("/:id/subscriptions/:token", next(function*(req, res) {
	yield subscriptionsDb.update(req.subscription, {
		__proto__: parseSubscription(req.body),
		updated_at: new Date
	})

	res.flash("notice", req.t("INITIATIVE_SUBSCRIPTION_UPDATED"))
	res.redirect(303, req.baseUrl + req.url)
}))

exports.router.delete("/:id/subscriptions/:token", next(function*(req, res) {
	var initiative = req.initiative
	var subscription = req.subscription

	yield subscriptionsDb.execute(sql`
		DELETE FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.id}
		AND update_token = ${subscription.update_token}
	`)

	res.flash("notice", req.t("INITIATIVE_SUBSCRIPTION_DELETED"))
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

function* searchInitiativeEvents(t, initiative) {
	var events = yield eventsDb.search(sql`
		SELECT * FROM initiative_events
		WHERE initiative_uuid = ${initiative.uuid}
		ORDER BY "occurred_at" ASC
	`)

	var sentToParliamentAt = initiative.sent_to_parliament_at
	var finishedInParliamentAt = initiative.finished_in_parliament_at

	return concat(
		sentToParliamentAt ? {
			id: "sent-to-parliament",
			title: t("FIRST_PROCEEDING_TITLE"),
			text: t("FIRST_PROCEEDING_BODY"),
			updated_at: sentToParliamentAt,
			occurred_at: sentToParliamentAt,
			origin: "admin"
		} : EMPTY_ARR,

		events,

		finishedInParliamentAt ? {
			id: "finished-in-parliament",
			title: t("PROCEEDING_FINISHED_TITLE"),
			text: "",
			updated_at: finishedInParliamentAt,
			occurred_at: finishedInParliamentAt,
			origin: "admin"
		} : EMPTY_ARR
	)
}

function isDbInitiativeUpdate(obj) {
	return (
		"author_url" in obj ||
		"url" in obj ||
		"community_url" in obj ||
		"organizations" in obj ||
		"media_urls" in obj ||
		"meetings" in obj ||
		"notes" in obj
	)
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

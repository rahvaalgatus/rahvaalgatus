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
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var initiativesDb = require("root/db/initiatives_db")
var initiativeSubscriptionsDb = require("root/db/initiative_subscriptions_db")
var initiativeSignaturesDb = require("root/db/initiative_signatures_db")
var countVotes = Initiative.countSignatures.bind(null, "Yes")
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var catch401 = require("root/lib/fetch").catch.bind(null, 401)
var isFetchError = require("root/lib/fetch").is
var next = require("co-next")
var sleep = require("root/lib/promise").sleep
var cosApi = require("root/lib/citizenos_api")
var sql = require("sqlate")
var parseCitizenInitiative = cosApi.parseCitizenInitiative
var parseCitizenEvent = cosApi.parseCitizenEvent
var parseCitizenComment = cosApi.parseCitizenComment
var readInitiativesWithStatus = cosApi.readInitiativesWithStatus
var encode = encodeURIComponent
var translateCitizenError = require("root/lib/citizenos_api").translateError
var hasMainPartnerId = Initiative.hasPartnerId.bind(null, Config.apiPartnerId)
var sendEmail = require("root").sendEmail
var concat = Array.prototype.concat.bind(Array.prototype)
var randomHex = require("root/lib/crypto").randomHex
var decodeBase64 = require("root/lib/crypto").decodeBase64
var EMPTY_ARR = Array.prototype
var EMPTY_INITIATIVE = {title: "", contact: {name: "", email: "", phone: ""}}
var EMPTY_COMMENT = {subject: "", text: "", parentId: null}

var RESPONSE_TYPES = [
	"text/html",
	"application/vnd.rahvaalgatus.initiative+json; v=1"
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

	var closed = _.groupBy(initiatives.closed, Initiative.getUnclosedStatus)
	var votings = concat(initiatives.voting, closed.voting || EMPTY_ARR)

	var uuids = concat(
		initiatives.followUp,
		initiatives.closed || EMPTY_ARR
	).map((i) => i.id)

	var dbInitiatives = yield initiativesDb.search(uuids, {create: true})
	dbInitiatives = _.indexBy(dbInitiatives, "uuid")

	res.render("initiatives_page.jsx", {
		discussions: concat(
			sortByCreatedAt(initiatives.inProgress, "createdAt").reverse(),
			sortByCreatedAt((closed.inProgress || EMPTY_ARR).filter(hasMainPartnerId))
		),

		votings: _.sortBy(votings, countVotes).reverse(),

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
	function(req, res, next) {
	var initiative = req.initiative

	switch (res.contentType.name) {
		case "application/vnd.rahvaalgatus.initiative+json":
			res.setHeader("Content-Type", res.contentType)
			res.setHeader("Access-Control-Allow-Origin", "*")

			res.send({
				title: initiative.title,
				signatureCount: initiative.vote ? countVotes(initiative) : 0
			})
			break

		default: next()
	}
})

exports.read = next(function*(req, res) {
	var user = req.user
	var initiative = req.initiative
	var events

	var signature
	if (user == null && req.flash("signed")) signature = {
		initiative_uuid: initiative.id,
		user_uuid: null,
		hidden: false
	}
	else if (user && Initiative.hasVote("Yes", initiative)) signature = (
		(yield initiativeSignaturesDb.read(sql`
			SELECT * FROM initiative_signatures
			WHERE (initiative_uuid, user_uuid) = (${initiative.id}, ${user.id})
		`)) || {
			initiative_uuid: initiative.id,
			user_uuid: user.id,
			hidden: false
		})

	if (signature && signature.hidden) signature = null

	var commentsPath = `/api/topics/${initiative.id}/comments?orderBy=date`
	if (req.user) commentsPath = "/api/users/self" + commentsPath.slice(4)
	var comments = yield req.cosApi(commentsPath)
	comments = comments.body.data.rows.map(parseCitizenComment).reverse()

	if (initiative.vote && (
		initiative.status == "followUp" ||
		initiative.status == "closed"
	)) {
		var eventsPath = `/api/topics/${initiative.id}/events`
		if (req.user) eventsPath = "/api/users/self" + eventsPath.slice(4)
		events = yield req.cosApi(eventsPath)
		events = events.body.data.rows.map(parseCitizenEvent)
		events = events.sort((a, b) => +b.createdAt - +a.createdAt)
	}
	else events = EMPTY_ARR

	res.render("initiatives/read_page.jsx", {
		signature: signature,
		comments: comments,
		comment: res.locals.comment || EMPTY_COMMENT,
		events: events
	})
})

exports.router.get("/:id", exports.read)

exports.router.put("/:id", next(function*(req, res) {
	var initiative = req.initiative
	var unclosedStatus = Initiative.getUnclosedStatus(initiative)
	res.locals.subpage = unclosedStatus == "inProgress" ? "discussion" : "vote"

	var tmpl
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
		if (!Initiative.canSendToParliament(initiative)) throw new HttpError(401)
		if (req.body.contact == null) return void res.render(tmpl, {attrs: attrs})

		attrs = {
			status: req.body.status,
			contact: O.defaults(req.body.contact, EMPTY_INITIATIVE.contact)
		}
	}
	else if ("notes" in req.body) {
		if (!Initiative.canEdit(initiative)) throw new HttpError(401)

		yield initiativesDb.update(initiative.id, {
			notes: String(req.body.notes).trim()
		})

		res.flash("notice", req.t("NOTES_UPDATED"))
		res.redirect(303, req.baseUrl + "/" + initiative.id + "/edit")
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
		else if (req.body.status === "voting")
			res.flash("notice", "Algatus on avatud allkirjade kogumiseks.")
		else if (req.body.status === "followUp") {
			if (!req.dbInitiative.sent_to_parliament_at)
				yield initiativesDb.update(initiative.id, {
					sent_to_parliament_at: new Date
				})

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
		var signature = yield initiativeSignaturesDb.read(sql`
			SELECT * FROM initiative_signatures
			WHERE (initiative_uuid, user_uuid) = (${initiative.id}, ${user.id})
		`)

		if (!signature) yield initiativeSignaturesDb.create({
			initiative_uuid: initiative.id,
			user_uuid: user.id,
			hidden: true,
			updated_at: new Date
		})
		else if (!signature.hidden) yield initiativeSignaturesDb.execute(sql`
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
		subscription = yield initiativeSubscriptionsDb.create({
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
			subscription = yield initiativeSubscriptionsDb.read(sql`
				SELECT * FROM initiative_subscriptions
				WHERE (initiative_uuid, email) = (${initiative.id}, ${email})
			`)

		else throw ex
	}

	if (!subscription.confirmed_at && !subscription.confirmation_sent_at) {
		var initiativeUrl = Http.link(req, req.baseUrl + "/" + initiative.id)
		var token = subscription.confirmation_token

		yield sendEmail({
			to: email,

			subject: req.t("CONFIRM_INITIATIVE_SUBSCRIPTION_TITLE", {
				initiativeTitle: initiative.title
			}),

			text: req.t("CONFIRM_INITIATIVE_SUBSCRIPTION_BODY", {
				url: initiativeUrl + "/subscriptions/new?confirmation_token=" + token,
				initiativeTitle: initiative.title,
				initiativeUrl: initiativeUrl,
				siteUrl: Config.url
			})
		})

		yield initiativeSubscriptionsDb.update(subscription, {
			confirmation_sent_at: new Date,
			updated_at: new Date
		})
	}

	res.flash("notice", req.t("CONFIRM_INITIATIVE_SUBSCRIPTION"))
	res.redirect(303, req.baseUrl + "/" + initiative.id)
}))

exports.router.get("/:id/subscriptions/new", next(function*(req, res, next) {
	var initiative = req.initiative

	var subscription = yield initiativeSubscriptionsDb.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.id}
		AND confirmation_token = ${req.query.confirmation_token}
		LIMIT 1
	`)

	if (subscription) {
		if (!subscription.confirmed_at)
			yield initiativeSubscriptionsDb.update(subscription, {
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
	req.subscription = yield initiativeSubscriptionsDb.read(sql`
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

exports.router.delete("/:id/subscriptions/:token", next(function*(req, res) {
	var initiative = req.initiative
	var subscription = req.subscription

	yield initiativeSubscriptionsDb.execute(sql`
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
	return initiativeSignaturesDb.execute(sql`
		UPDATE initiative_signatures
		SET hidden = 0, updated_at = ${new Date}
		WHERE (initiative_uuid, user_uuid) = (${initiativeId}, ${userId})
	`)
}

// NOTE: Use this only on JWTs from trusted sources as it does no validation.
function parseJwt(jwt) { return JSON.parse(decodeBase64(jwt.split(".")[1])) }

function getBody(res) { return res.body.data }
function sortByCreatedAt(arr) { return _.sortBy(arr, "createdAt").reverse() }

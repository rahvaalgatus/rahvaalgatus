var _ = require("root/lib/underscore")
var Router = require("express").Router
var Config = require("root/config")
var HttpError = require("standard-http-error")
var I18n = require("root/lib/i18n")
var cosApi = require("root/lib/citizenos_api")
var readInitiativesWithStatus = cosApi.readInitiativesWithStatus
var initiativeSubscriptionsDb = require("root/db/initiative_subscriptions_db")
var next = require("co-next")
var initiativesDb = require("root/db/initiatives_db")
var initiativeMessagesDb = require("root/db/initiative_messages_db")
var cosDb = require("root").cosDb
var encode = encodeURIComponent
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var parseCitizenInitiative = cosApi.parseCitizenInitiative
var parseCitizenEvent = cosApi.parseCitizenEvent
var newUuid = require("uuid/v4")
var pseudoHex = require("root/lib/crypto").pseudoHex
var sqlite = require("root").sqlite
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")
var sendEmail = require("root").sendEmail
var STATUSES = ["followUp", "closed"]
exports = module.exports = Router()

exports.get("/", next(function*(_req, res) {
	var subscriptions = yield initiativeSubscriptionsDb.search(sql`
		SELECT *
		FROM initiative_subscriptions
		ORDER BY created_at DESC
		LIMIT 15
	`)

	var uuids = _.uniq(subscriptions.map((s) => s.initiative_uuid))
	var query = sql`
		SELECT id, title FROM "Topics" WHERE id IN ${sql.tuple(uuids)}
	`

	var initiatives = _.indexBy(
		yield cosDb.raw(String(query), query.parameters).then(getRows),
		"id"
	)

	subscriptions.forEach(function(subscription) {
		subscription.initiative = initiatives[subscription.initiative_uuid]
	})

	res.render("admin/dashboard_page.jsx", {
		subscriptions: subscriptions
	})
}))

exports.get("/initiatives", next(function*(_req, res) {
	var initiatives = yield {
		votings: readInitiativesWithStatus("voting"),
		parliamented: yield readInitiativesWithStatus("followUp"),
		closed: yield readInitiativesWithStatus("closed")
	}

	var uuids = flatten(_.values(initiatives)).map((i) => i.id)
	var dbInitiatives = yield initiativesDb.search(uuids, {create: true})
	dbInitiatives = _.indexBy(dbInitiatives, "uuid")

	var subscriberCounts = yield sqlite(sql`
		SELECT initiative_uuid, COUNT(*) as count
		FROM initiative_subscriptions
		WHERE initiative_uuid IN ${sql.tuple(uuids)}
		AND confirmed_at IS NOT NULL
		GROUP BY initiative_uuid
	`)

	subscriberCounts = _.mapValues(
		_.indexBy(subscriberCounts, "initiative_uuid"),
		(c) => c.count
	)

	res.render("admin/initiatives/index_page.jsx", {
		votings: initiatives.votings,
		parliamented: initiatives.parliamented,
		closed: initiatives.closed,
		dbInitiatives: dbInitiatives,
		subscriberCounts: subscriberCounts
	})
}))

exports.use("/initiatives/:id", next(function*(req, res, next) {
	var path = `/api/topics/${encode(req.params.id)}?include[]=vote&include[]=event`
	req.initiative = yield cosApi(path).then(getBody).then(parseCitizenInitiative)
	req.dbInitiative = yield initiativesDb.read(req.initiative.id, {create: true})
	res.locals.initiative = req.initiative
	res.locals.dbInitiative = req.dbInitiative
	next()
}))

exports.get("/initiatives/:id", next(function*(req, res) {
	var initiative = req.initiative
	var events = yield readEvents(initiative.id)
	events = events.sort((a, b) => +b.createdAt - +a.createdAt)

	var subscriberCount = yield sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
			AS confirmed

		FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.id}
	`).then(_.first)

	var messages = yield initiativeMessagesDb.search(sql`
		SELECT * FROM initiative_messages
		WHERE initiative_uuid = ${initiative.id}
		ORDER BY created_at DESC
	`)

	res.render("admin/initiatives/read_page.jsx", {
		initiative: initiative,
		dbInitiative: req.dbInitiative,
		events: events,
		subscriberCount: subscriberCount,
		messages: messages
	})
}))

exports.get("/initiatives/:id/subscriptions.:ext?", next(function*(req, res) {
	var initiative = req.initiative

	var subs = yield initiativeSubscriptionsDb.search(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.id}
		ORDER BY created_at DESC
	`)

	switch (req.params.ext) {
		case "txt":
			var confirmed = _.parseTrilean(req.query.confirmed)
			if (confirmed != null)
				subs = subs.filter((s) => !!s.confirmed_at == confirmed)

			res.setHeader("Content-Type", "text/plain; charset=utf-8")
			res.end(subs.map((s) => s.email).join("\n"))
			break
			
		default: res.render("admin/initiatives/subscriptions_page.jsx", {
			initiative: initiative,
			dbInitiative: req.dbInitiative,
			subscriptions: subs
		})
	}
}))

exports.put("/initiatives/:id", next(function*(req, res) {
	var attrs = parseInitiative(req.body)
	var citizenAttrs = parseInitiativeForCitizen(req.body)

	if (!_.isEmpty(attrs))
		yield initiativesDb.update(req.initiative.id, parseInitiative(req.body))
	if (!_.isEmpty(citizenAttrs))
		yield cosDb("Topics").where("id", req.params.id).update(citizenAttrs)

	res.flash("notice", "Initiative updated.")
	res.redirect("/initiatives/" + req.initiative.id)
}))

exports.get("/initiatives/:id/events/new", function(_req, res) {
	res.render("admin/initiatives/events/create_page.jsx", {
		event: {createdAt: new Date, title: "", text: ""}
	})
})

exports.post("/initiatives/:id/events", next(function*(req, res) {
	var event = _.assign(parseEvent(req.body), {
		id: newUuid(),
		topicId: req.initiative.id,
		createdAt: new Date,
		updatedAt: new Date
	})

	yield cosDb("TopicEvents").insert(event)
	res.flash("notice", "Event created.")
	res.redirect("/initiatives/" + req.initiative.id)
}))

exports.get("/initiatives/:id/events/:eventId/edit", next(function*(req, res) {
	res.render("admin/initiatives/events/update_page.jsx", {
		event: yield readEvent(req.params.eventId)
	})
}))

exports.put("/initiatives/:id/events/:eventId", next(function*(req, res) {
	var event = _.assign(parseEvent(req.body), {updatedAt: new Date})
	var query = cosDb("TopicEvents").where("id", req.params.eventId)
	yield query.update(event)

	res.flash("notice", "Event updated.")
	res.redirect("/initiatives/" + req.initiative.id)
}))

exports.delete("/initiatives/:id/events/:eventId", next(function*(req, res) {
	var query = cosDb("TopicEvents").where("id", req.params.eventId)
	yield query.update({deletedAt: new Date})
	res.flash("notice", "Event deleted.")
	res.redirect("/initiatives/" + req.initiative.id)
}))

exports.get("/initiatives/:id/messages/new", next(function*(req, res) {
	var initiative = req.initiative

	res.render("admin/initiatives/messages/create_page.jsx", {
		message: {
			title: t("DEFAULT_INITIATIVE_SUBSCRIPTION_MESSAGE_TITLE", {
				initiativeTitle: initiative.title,
			}),

			text: t("DEFAULT_INITIATIVE_SUBSCRIPTION_MESSAGE_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: Config.url + req.baseUrl + "/" + initiative.id,
				unsubscribeUrl: "{{unsubscribeUrl}}",
				siteUrl: Config.url
			})
		},

		subscriptions: yield searchConfirmedSubscriptions(initiative)
	})
}))

exports.post("/initiatives/:id/messages", next(function*(req, res) {
	var initiative = req.initiative
	var msg = req.body

	switch (msg.action) {
		case "send":
			var message = yield initiativeMessagesDb.create({
				initiative_uuid: initiative.id,
				title: msg.title,
				text: msg.text,
				created_at: new Date,
				updated_at: new Date,
			})

			var subscriptions = yield searchConfirmedSubscriptions(initiative)

			for (
				var i = 0, batches = _.chunk(subscriptions, 1000), sent = [];
				i < batches.length;
				++i
			) {
				yield sendInitiativeMessage(message, batches[i])
				sent = sent.concat(batches[i].map((sub) => sub.email))

				yield initiativeMessagesDb.update(message, {
					updated_at: new Date,
					sent_to: sent
				})
			}

			yield initiativeMessagesDb.update(message, {
				updated_at: new Date,
				sent_at: new Date,
			})

			res.flash("notice", "Message sent.")
			res.redirect("/initiatives/" + req.initiative.id)
			break

		case "preview":
			var unsubscribeUrl= Config.url + "/initiatives/" + initiative.id
			unsubscribeUrl += "/subscriptions/" + pseudoHex(8)

			res.render("admin/initiatives/messages/create_page.jsx", {
				message: {
					title: msg.title,
					text: msg.text,
				},

				preview: {
					title: msg.title,
					text: I18n.interpolate(msg.text, {unsubscribeUrl: unsubscribeUrl})
				},

				subscriptions: yield searchConfirmedSubscriptions(initiative)
			})
			break

		default: throw new HttpError(422, "Invalid Action")
	}
}))

exports.get("/subscriptions", next(function*(_req, res) {
	var subscriptions = yield initiativeSubscriptionsDb.search(sql`
		SELECT *
		FROM initiative_subscriptions
		WHERE initiative_uuid IS NULL
		ORDER BY created_at DESC
	`)

	res.render("admin/subscriptions/index_page.jsx", {
		subscriptions: subscriptions
	})
}))

function parseInitiative(obj) {
	var attrs = {}

	if ("sentToParliamentOn" in obj)
		attrs.sent_to_parliament_at = obj.sentToParliamentOn
			? new Date(obj.sentToParliamentOn)
			: null

	if ("finishedInParliamentOn" in obj)
		attrs.finished_in_parliament_at = obj.finishedInParliamentOn
			? new Date(obj.finishedInParliamentOn)
			: null

	return attrs
}

function parseInitiativeForCitizen(obj) {
	var attrs = {}

	if ("status" in obj && _.contains(STATUSES, obj.status))
		attrs.status = obj.status

	return attrs
}

function* readEvent(id) {
	var event = yield cosDb("TopicEvents").where("id", id).first()
	return parseCitizenEvent(event)
}

function* readEvents(initiativeId) {
	var events = yield cosDb("TopicEvents").where("topicId", initiativeId)
	return events.map(parseCitizenEvent)
}

function searchConfirmedSubscriptions(initiative) {
	return initiativeSubscriptionsDb.search(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.id}
		AND confirmed_at IS NOT NULL
		ORDER BY created_at DESC
	`)
}

function sendInitiativeMessage(msg, subscriptions) {
	if (subscriptions.length > 1000)
		// https://documentation.mailgun.com/en/latest/user_manual.html
		throw new RangeError("Batch sending max limit is 1000 recipients")

	var recipients = _.fromEntries(subscriptions.map((sub) => [sub.email, {
		unsubscribeUrl: [
			Config.url,
			"initiatives",
			sub.initiative_uuid,
			"subscriptions",
			sub.update_token
		].join("/")
	}]))

	return sendEmail({
		to: {name: "", address: "%recipient%"},
		subject: msg.title,
		headers: {"X-Mailgun-Recipient-Variables": JSON.stringify(recipients)},
		envelope: {to: Object.keys(recipients)},

		text: I18n.interpolate(msg.text, {
			unsubscribeUrl: "%recipient.unsubscribeUrl%"
		})
	})
}

function parseEvent(obj) {
  var title = obj.createdOn + " " + obj.title
	return {subject: title, text: obj.text}
}

function getBody(res) { return res.body.data }
function getRows(res) { return res.rows }

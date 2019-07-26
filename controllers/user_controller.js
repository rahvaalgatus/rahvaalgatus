var _ = require("root/lib/underscore")
var O = require("oolong")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var translateCitizenError = require("root/lib/citizenos_api").translateError
var searchInitiatives = require("root/lib/citizenos_db").searchInitiatives
var countSignaturesByIds = require("root/lib/citizenos_db").countSignaturesByIds
var sql = require("sqlate")
var cosDb = require("root").cosDb
var initiativesDb = require("root/db/initiatives_db")
var initiativeSignaturesDb = require("root/db/initiative_signatures_db")
var next = require("co-next")
var concat = Array.prototype.concat.bind(Array.prototype)

exports.router = Router({mergeParams: true})

exports.router.use(function(req, _res, next) {
	if (req.user == null) throw new HttpError(401)
	next()
})

exports.router.get("/", next(read))

exports.router.put("/", next(function*(req, res, next) {
	var updated = yield req.cosApi("/api/users/self", {
		method: "PUT",
		json: {name: req.body.name, email: req.body.email}
	}).catch(catch400)

	if (isOk(updated)) {
		res.flash("notice", "Muudatused salvestatud.")
		res.redirect(303, req.baseUrl)
	}
	else {
		res.status(422)
		res.locals.error = translateCitizenError(req.t, updated.body)
		res.locals.userAttrs = req.body
		yield read(req, res, next)
	}
}))

function* read(req, res) {
	var user = req.user

	var signatures = yield cosDb.query(sql`
		SELECT
			DISTINCT ON (tv."topicId")
			tv."topicId" as initiative_uuid,
			signature."createdAt" as created_at,
			opt.value AS support

		FROM "VoteLists" AS signature
		JOIN "Votes" AS vote ON vote.id = signature."voteId"
		JOIN "TopicVotes" AS tv ON tv."voteId" = vote.id
		JOIN "VoteOptions" AS opt ON opt."voteId" = vote.id

		WHERE signature."userId" = ${user.id}
		AND vote.id IS NOT NULL
		AND signature."optionId" = opt.id

		ORDER BY tv."topicId", signature."createdAt" DESC
	`)

	signatures = signatures.filter((sig) => sig.support == "Yes")

	var dbSignatures = _.indexBy(yield initiativeSignaturesDb.search(sql`
		SELECT * FROM initiative_signatures
		WHERE user_uuid = ${user.id}
		AND initiative_uuid IN ${sql.in(signatures.map((s) => s.initiative_uuid))}
	`), "initiative_uuid")

	signatures = signatures.filter(function(sig) {
		var dbSignature = dbSignatures[sig.initiative_uuid]
		return dbSignature == null || !dbSignature.hidden
	})

	var authoredTopics = yield searchInitiatives(sql`
		"creatorId" = ${user.id}
	`)

	var authoredInitiatives = yield initiativesDb.search(sql`
		SELECT * FROM initiatives
		WHERE uuid IN ${sql.in(authoredTopics.map((t) => t.id))}
	`)

	var signedTopics = yield searchInitiatives(sql`
		initiative.id IN ${sql.in(signatures.map((s) => s.initiative_uuid))}
		AND initiative.visibility = 'public'
	`)

	var signedInitiatives = yield initiativesDb.search(sql`
		SELECT * FROM initiatives
		WHERE uuid IN ${sql.in(signedTopics.map((t) => t.id))}
	`)

	var topics = _.indexBy(concat(authoredTopics, signedTopics), "id")

	function setInitiativeTitle(initiative) {
		var topic = topics[initiative.uuid]
		if (topic) initiative.title = topic.title
	}

	authoredInitiatives.forEach(setInitiativeTitle)
	signedInitiatives.forEach(setInitiativeTitle)

	var signatureCounts = yield countSignaturesByIds(_.keys(topics))

	res.render("user/read_page.jsx", {
		user: user,
		authoredInitiatives: authoredInitiatives,
		signedInitiatives: signedInitiatives,
		topics: topics,
		signatureCounts: signatureCounts,
		userAttrs: O.create(user, res.locals.userAttrs)
	})
}

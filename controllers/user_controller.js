var _ = require("root/lib/underscore")
var O = require("oolong")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var cosApi = require("root/lib/citizenos_api")
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var translateCitizenError = require("root/lib/citizenos_api").translateError
var parseCitizenInitiative = require("root/lib/citizenos_api").parseCitizenInitiative
var sql = require("sqlate")
var cosDb = require("root").cosDb
var initiativesDb = require("root/db/initiatives_db")
var initiativeSignaturesDb = require("root/db/initiative_signatures_db")
var concat = Array.prototype.concat.bind(Array.prototype)
var next = require("co-next")

exports.router = Router({mergeParams: true})

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
	if (user == null) throw new HttpError(401)

	var path = "/api/users/self/topics?include[]=vote&include[]=event"
	var initiatives = req.cosApi(path)
	initiatives = yield initiatives.then(getRows)
	initiatives = initiatives.map(parseCitizenInitiative)

	var signatures = yield cosDb.query(sql`
		SELECT
			DISTINCT ON (tv."topicId")
			tv."topicId" as initiative_id,
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
		AND initiative_uuid IN ${sql.tuple(signatures.map((s) => s.initiative_id))}
	`, "initiative_uuid"))

	signatures = signatures.filter(function(sig) {
		var dbSignature = dbSignatures[sig.initiative_id]
		return !dbSignature || !dbSignature.hidden
	})

	var signedInitiatives = yield signatures.map(function(sig) {
		var path = `/api/topics/${sig.initiative_id}`
		path += "?include[]=vote&include[]=event"
		return cosApi(path).then(getBody).then(parseCitizenInitiative)
	})

	var uuids = concat(initiatives, signedInitiatives).map((i) => i.id)
	var dbInitiatives = yield initiativesDb.search(uuids, {create: true})

	res.render("user/read_page.jsx", {
		user: user,
		initiatives: initiatives,
		signedInitiatives: signedInitiatives,
		dbInitiatives: dbInitiatives,
		userAttrs: O.create(user, res.locals.userAttrs)
	})
}

function getBody(res) { return res.body.data }
function getRows(res) { return res.body.data.rows }

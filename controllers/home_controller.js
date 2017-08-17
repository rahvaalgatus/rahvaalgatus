var _ = require("lodash")
var Router = require("express").Router
var Initiative = require("root/lib/initiative")
var DateFns = require("date-fns")
var next = require("co-next")
var api = require("root/lib/api")
var readInitiativesWithStatus = api.readInitiativesWithStatus
var concat = Array.prototype.concat.bind(Array.prototype)
var VOTES_REQUIRED = require("root/config").votesRequired
var EMPTY_ARR = Array.prototype

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res) {
	var initiatives = yield {
		discussions: readInitiativesWithStatus("inProgress"),
		votings: readInitiativesWithStatus("voting"),
		processes: readInitiativesWithStatus("followUp"),
	}

	var hasFailed = Initiative.hasVoteFailed.bind(null, new Date)

	var discussions = initiatives.discussions
	var votings = _.reject(initiatives.votings, hasFailed)
	var processes = initiatives.processes

	res.render("home/index", {
		discussions: discussions,
		votings: votings,
		processes: processes,
		processed: EMPTY_ARR,

		visionInitiatives: concat(
			initiatives.discussions,
			_.reject(initiatives.votings, hasFailed),
			initiatives.processes
		).map(serializeForVision.bind(null, req.t))
	})
}))

exports.router.get("/donate", function(req, res) {
	var transaction = "json" in req.query ? parseJson(req.query.json) : null

	res.render("home/donate", {
		amount: transaction && Number(transaction.amount),
		reference: transaction && transaction.reference
	})
})

exports.router.get("/about", (_req, res) => res.render("home/about"))
exports.router.get("/donated", (_req, res) => res.render("home/donated"))
exports.router.get("/effective-ideas", (_req, res) => res.render("home/ideas"))

exports.router.get("/effective-ideas/govermental", function(_req, res) {
	res.render("home/ideas-for-gov")
})

function serializeForVision(t, initiative) {
	var progress
	var progressText = ""
	var createdAt = new Date(initiative.createdAt)

	switch (initiative.status) {
		case "inProgress":
			if (!Initiative.hasDiscussionEnded(new Date, initiative)) {
				var passed = DateFns.differenceInCalendarDays(new Date, createdAt)
				var total = Initiative.daysInDiscussion(initiative)

				progress = passed / total
				progressText = t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {
					numberOfDaysLeft: total - passed
				})
			}
			else {
				progress = "completed"
				progressText = t("DISCUSSION_FINISHED")
			}
			break

		case "voting":
			var sigs = Initiative.countSignatures("Yes", initiative)

			if (Initiative.isSuccessful(initiative)) {
				progress = "completed"
				progressText = t("N_SIGNATURES_COLLECTED", {votes: sigs})
			}
			else if (!Initiative.hasVoteEnded(new Date, initiative)) {
				progress = sigs / VOTES_REQUIRED
				progressText = t("N_SIGNATURES", {votes: sigs})
			}
			else {
				progress = "failed"
				progressText = t("N_SIGNATURES_FAILED", {votes: sigs})
			}
			break

		case "followUp":
			progress = Initiative.countSignatures("Yes", initiative)
			progressText = t("N_SIGNATURES", {votes: sigs})
			break
	}

	return {
		id: initiative.id,
		url: `/initiatives/${initiative.id}`,
		title: initiative.title,
		subtitle: t(`${initiative.id}_SUBTITLE`),
		categories: initiative.categories,
		status: initiative.status,
		progress: progress,
		progressText: progressText
	}
}

function parseJson(json) {
	try { return JSON.parse(json) } catch (ex) { return null }
}
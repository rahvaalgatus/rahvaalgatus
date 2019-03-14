var Config = require("root/config")
var _ = require("root/lib/underscore")
var cosApi = require("root/lib/citizenos_api")
var parliamentApi = require("root/lib/parliament_api")
var sqlite = require("root").sqlite
var sql = require("root/lib/sql")
var is404 = require("root/lib/fetch_error").is.bind(null, 404)
var diff = require("root/lib/diff")
var assert = require("assert")
var initiativesDb = require("root/db/initiatives_db")
var sendEmail = require("root").sendEmail
var logger = require("root").logger

var template = require("root/lib/fs").readTemplateLazy(
	require.resolve("root/emails/parliament_monitor_email.txt.ejs")
)

module.exports = function*() {
	var objs = (yield parliamentApi("documents/collective-addresses")).body
	yield filterInitiatives(objs)
}

function* filterInitiatives(objs) {
	objs = objs.filter((a) => a.senderReference)

	var pairs = _.zip(
		(yield objs.map((obj) => readOrCreateDbInitiative(obj.senderReference))),
		objs
	).filter(_.first)

	var updated = pairs.map(diffParliamentData).filter(_.third)
	yield updated.map(notify)
	yield updated.map(updateDbInitiativeParliamentData)
}

function diffParliamentData(initiativeAndObj) {
	var initiative = initiativeAndObj[0]
	var obj = initiativeAndObj[1]
	return [initiative, obj, diff(initiative.parliament_api_data, obj)]
}

function* updateDbInitiativeParliamentData(initiativeAndObj) {
	var initiative = initiativeAndObj[0]
	var obj = initiativeAndObj[1]

	yield sqlite.update(sql`
		UPDATE initiatives
		SET parliament_api_data = ${JSON.stringify(obj)}
		WHERE uuid = ${initiative.uuid}
	`)
}

function* notify(initiativeAndObjAndDiff) {
	var initiative = initiativeAndObjAndDiff[0]
	var obj = initiativeAndObjAndDiff[1]
	var url = Config.url + "/initiatives/" + initiative.uuid
	var json = JSON.stringify(obj, null, "  ")

	logger.info("Initiative %s updated in parliament API.", initiative.uuid)

	if (Config.notificationEmails.length > 0) yield sendEmail({
		to: Config.notificationEmails,
    subject: "Initiative updated in parliament API",
    text: template({initiativeUrl: url, json: json, siteUrl: Config.url})
	})
}

function* readOrCreateDbInitiative(uuid) {
	var obj = yield initiativesDb.search(uuid)
	if (obj) return obj

	var res
	try { res = yield cosApi("/api/topics/" + uuid) }
	catch (ex) { if (is404(ex)) return null; throw ex }
	assert(res.body.data.id === uuid)

	return yield initiativesDb.create({uuid: uuid})
}

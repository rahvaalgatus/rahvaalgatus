var _ = require("root/lib/underscore")
var Fs = require("fs")
var Neodoc = require("neodoc")
var Url = require("url")
var Time = require("root/lib/time")
var FetchError = require("fetch-error")
var diff = require("root/lib/diff")
var parseDom = require("root/lib/dom").parse
var parliamentApi = require("root/lib/parliament_api")
var concatStream = require("concat-stream")
var defer = require("promise-defer")
var map = Function.call.bind(Array.prototype.map)
var concat = Array.prototype.concat.bind(Array.prototype)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var sql = require("sqlate")
var {parseTitle} = require("./parliament_sync_cli")
var replaceApiInitiative = require("./parliament_sync_cli").replaceInitiative
var {assignInitiativeDocuments} = require("./parliament_sync_cli")
var {readParliamentVolumeWithDocuments} = require("./parliament_sync_cli")
var initiativesDb = require("root/db/initiatives_db")
var logger = require("root").logger
var WEB_URL = "https://www.riigikogu.ee/tutvustus-ja-ajalugu/raakige-kaasa/esitage-kollektiivne-poordumine/riigikogule-esitatud-kollektiivsed-poordumised"
var DOCUMENT_URL = "https://www.riigikogu.ee/tegevus/dokumendiregister/dokument"
var VOLUME_URL = "https://www.riigikogu.ee/tegevus/dokumendiregister/toimikud"
var DRAFTS_URL = "https://www.riigikogu.ee/tegevus/eelnoud"
var API_URL = "documents/collective-addresses"
var LOCAL_DATE = /^(\d?\d).(\d\d).(\d\d\d\d)$/

var USAGE_TEXT = `
Usage: cli parliament-web-sync (-h | --help)
       cli parliament-web-sync [options] [<uuid>]

Options:
    -h, --help           Display this help and exit.
    --all                Also sync initiatives that are in the parliament API.
    --cached             Do not refresh initiatives from the parliament API.
    --web-file=FILE      Use given HTML for Riigikogu's initiatives page.
    --api-file=FILE      Use given JSON for Riigikogu's collective-addresses.
`

module.exports = function*(argv) {
  var args = Neodoc.run(USAGE_TEXT, {argv: argv || ["parliament-web-sync"]})
  if (args["--help"]) return void process.stdout.write(USAGE_TEXT.trimLeft())

	var htmlPath = args["--web-file"]
	var html = yield (htmlPath == null ? readWeb(WEB_URL) : readPath(htmlPath))

	var docsPath = args["--api-file"]
	var docs = yield (docsPath == null ? readApi(API_URL) : readJson(docsPath))
	var docsByUuid = _.indexBy(docs, "uuid")

	var dom = parseDom(html)
	var article = dom.querySelector("article.content")
	var tables = article.querySelectorAll("table")
	var rows = flatten(map(tables, parseInitiatives))

	var uuid = args["<uuid>"]
	if (uuid == "") throw new Error("Invalid UUID: " + uuid)

	if (uuid) rows = rows.filter((row) => row.uuid === uuid)
	else if (!args["--all"]) rows = rows.filter((row) => !docsByUuid[row.uuid])

	if (args["--cached"]) {
		var initiatives = _.indexBy(yield initiativesDb.search(sql`
			SELECT * FROM initiatives
			WHERE parliament_api_data IS NOT NULL
			AND ${uuid
				? sql`uuid = ${uuid}`
				: sql`uuid IN ${sql.in(rows.map(getUuid))}`
			}
		`), "uuid")

		yield rows.map(function(row) {
			var initiative = initiatives[row.uuid]
			if (initiative.webDocuments == null) return null

			return replaceWebInitiative(
				initiative,
				initiative.parliament_api_data,
				row
			)
		})
	}
	else yield rows.map((row) => syncInitiative(row, docsByUuid[row.uuid]))
}

function* syncInitiative(row, collectiveAddressDocument) {
	var api = _.memoize(parliamentApi)

	var initiative = yield initiativesDb.read(sql`
		SELECT * FROM initiatives
		WHERE parliament_uuid = ${row.uuid}
		OR uuid = ${row.authorUrl && parseRahvaalgatusUuidFromUrl(row.authorUrl)}
	`)

	if (initiative == null && collectiveAddressDocument) return void logger.warn(
		"Ignoring initiative %s (%s) until it's first synced from the API.",
		row.uuid,
		row.title
	)

	logger.log("Syncing initiative %s (%s)…", row.uuid, row.title)

	var doc
	try { doc = yield api("documents/" + row.uuid).then(getBody) }
	catch (ex) {
		if (isParliament404(ex)) return void logger.warn(
			"Ignored initiative %s (%s) because it's not in the API.",
			row.uuid,
			row.title
		)
		else throw ex
	}

	if (collectiveAddressDocument) {
		collectiveAddressDocument.files = doc.files
		doc = collectiveAddressDocument
	}

	doc = yield assignInitiativeDocuments(api, doc)

	var uuids = row.links.map(function(titleAndUrl) {
		var url = titleAndUrl[1]
		var typeAndUrl = parseLink(url)
		if (typeAndUrl !== undefined) return typeAndUrl

		logger.warn(
			"Ignored initiative %s link «%s» (%s)",
			row.uuid,
			titleAndUrl[0],
			titleAndUrl[1]
		)

		return null
	}).filter(Boolean)

	var webDocumentUuids = uuids.filter((p) => p[0] == "document").map(_.second)
	var webVolumeUuids = uuids.filter((p) => p[0] == "volume").map(_.second)

	doc.webDocuments = yield webDocumentUuids.map((uuid) => (
		api("documents/" + uuid).then(getBody)
	))

	doc.webVolumes = yield webVolumeUuids.map(
		readParliamentVolumeWithDocuments.bind(null, api)
	)

	// Some initiative rows on the parliament page have links to the volume that
	// contains themselves. This will cause a cycle and fail at saving the
	// cache.
	doc.webVolumes.forEach(function(volume) {
		volume.documents = _.without(volume.documents, doc)
	})

	initiative = yield replaceWebInitiative(initiative, doc, row)

	initiativesDb.update(initiative, {
		parliament_api_data: doc,
		parliament_synced_at: new Date
	})
}

function* replaceWebInitiative(initiative, document, row) {
	var attrs = attrsFrom(row, document)

	if (initiative == null) initiative = {
		__proto__: attrs,
		title: document.title ? parseTitle(document.title) : "",
		phase: row.finishedOn ? "done" : "parliament",
		archived_at: row.finishedOn && new Date,
		external: true,

		// TODO: Ensure time parsing is always in Europe/Tallinn and don't depend
		// on TZ being set.
		// https://github.com/riigikogu-kantselei/api/issues/11
		created_at: document.created
			? Time.parseDateTime(document.created)
			: new Date
	}
	else if (diff(initiative, attrs))
		initiative = yield initiativesDb.update(initiative, attrs)

	var relatedDocuments = _.uniqBy(
		concat(document.relatedDocuments, document.webDocuments),
		"uuid"
	)

	var relatedVolumes = _.uniqBy(
		concat(document.relatedVolumes, document.webVolumes || []),
		"uuid"
	)

	yield replaceApiInitiative(initiative, {
		__proto__: document,
		relatedDocuments: relatedDocuments,
		relatedVolumes: relatedVolumes
	})

	return initiative
}

function parseInitiatives(table) {
	var header = map(table.tHead.rows[0].cells, (el) => el.textContent.trim())

	var initiativeElements = map(table.tBodies[0].rows, (el) => (
		_.object(header, (_key, i) => el.cells[i])
	))

	return initiativeElements.map(function(els) {
		// TODO: Ensure time parsing is always in Europe/Tallinn and don't depend
		// on TZ being set.
		// https://github.com/riigikogu-kantselei/api/issues/11
		var acceptedOn = parseDate(els["Menetlusse võetud"].textContent.trim())
		var title = parseTitle(els.Pealkiri.textContent.trim())

		var authorElement = els["Pöördumise esitajad"]
		var authorName = authorElement.textContent.trim()
		var authorLinkElement = authorElement.querySelector("a")
		var authorUrl = authorLinkElement && authorLinkElement.href

		var committeesElement = els["Riigikogu komisjon"]
		var committees = map(committeesElement.querySelectorAll("a"), (el) => (
			[el.textContent.trim(), el.href]
		))

		var links = map(els["Seotud dokumendid"].querySelectorAll("li"), (el) => (
			[el.firstElementChild.textContent.trim(), el.firstElementChild.href]
		))

		var doc
		[[doc], links] = _.partition(links, ([t]) => t == "Kollektiivne pöördumine")
		if (doc == null) throw new RangeError("No initiative document: " + title)

		var uuid = parseUuidFromUrl(doc[1])
		if (uuid == null) throw new RangeError("No UUID in " + doc[1])

		var finishedOn = els["Menetlus lõpetatud"].textContent.trim()
		finishedOn = finishedOn ? parseDate(finishedOn) : null

		return {
			uuid: uuid,
			acceptedOn: acceptedOn,
			title: title,
			authorName: authorName,
			authorUrl: authorUrl,
			committees: committees,
			links: links,
			finishedOn: finishedOn
		}
	})
}

function parseLink(url) {
	/* eslint consistent-return: 0 */
	if (url.startsWith(DOCUMENT_URL + "/")) {
		let uuid = url.slice(DOCUMENT_URL.length + 1).split("/")[0]
		if (uuid == null) throw new RangeError("No UUID in " + url)
		return ["document", uuid]
	}

	if (url.startsWith(VOLUME_URL + "/")) {
		let uuid = url.slice(VOLUME_URL.length + 1).split("/")[0]
		if (uuid == null) throw new RangeError("No UUID in " + url)
		return ["volume", uuid]
	}

	if (url.startsWith(DRAFTS_URL + "/")) return null
	return undefined
}

function parseRahvaalgatusUuidFromUrl(url) {
	url = Url.parse(url)

	if (!(
		url.hostname == "rahvaalgatus.ee" ||
		url.hostname == "www.rahvaalgatus.ee"
	)) return null

	var match = (
		/^\/initiatives\/([^/]+)/.exec(url.pathname) ||
		/^\/topics\/([^/]+)/.exec(url.pathname)
	)

	if (match) return match[1]
	else throw new RangeError("Unrecognized Rahvaalgatus URL: " + url)
}

function parseUuidFromUrl(url) {
	var r = /\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/
	return (r.exec(url) || Object)[1]
}

function attrsFrom(row, doc) {
	return {
		parliament_uuid: doc.uuid,
		parliament_committee: row.committees[0] && row.committees[0][0],
		received_by_parliament_at: doc.created && Time.parseDateTime(doc.created),
		accepted_by_parliament_at: row.acceptedOn,
		finished_in_parliament_at: row.finishedOn,
		author_name: row.authorName,
	}
}

function readPath(path) {
	var deferred = defer()
	var input = path == "-" ? process.stdin : Fs.createReadStream(path)
	var output = concatStream(deferred.resolve)
	input.setEncoding("utf8").pipe(output)
	input.on("error", deferred.reject)
	return deferred.promise
}

function readWeb(url) {
	return parliamentApi(url, {headers: {Accept: "text/html"}}).then(getBody)
}

function parseDate(date) {
	var match = LOCAL_DATE.exec(date)
	if (match == null) throw new SyntaxError("Invalid Date: " + date)
	return new Date(+match[3], +match[2] - 1, +match[1])
}

function isParliament404(err) {
	return (
		err instanceof FetchError &&
		err.code == 500 &&
		err.response.body &&
		/^Document not found with UUID:/.test(err.response.body.message)
	)
}

function getBody(res) { return res.body }
function getUuid(res) { return res.uuid }
function readJson(path) { return readPath(path).then(JSON.parse) }
function readApi(url) { return parliamentApi(url).then(getBody) }

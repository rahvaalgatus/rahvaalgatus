/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Url = require("url")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidFile = require("root/test/valid_event_file")
var MediaType = require("medium-type")
var ValidEvent = require("root/test/valid_db_initiative_event")
var respond = require("root/test/fixtures").respond
var job = require("root/cli/parliament_web_sync_cli")
var initiativesDb = require("root/db/initiatives_db")
var eventsDb = require("root/db/initiative_events_db")
var filesDb = require("root/db/initiative_files_db")
var sql = require("sqlate")
var newUuid = _.compose(_.serializeUuid, _.uuidV4)
var createUser = require("root/test/fixtures").createUser
var concat = Array.prototype.concat.bind(Array.prototype)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var WEB_INITIATIVES_PATH = "/tutvustus-ja-ajalugu/raakige-kaasa/esitage-kollektiivne-poordumine/riigikogule-esitatud-kollektiivsed-poordumised"
var PARLIAMENT_URL = "https://www.riigikogu.ee"
var DOCUMENT_URL = PARLIAMENT_URL + "/tegevus/dokumendiregister/dokument"
var VOLUME_URL = PARLIAMENT_URL + "/tegevus/dokumendiregister/toimikud"
var WEB_INITIATIVES_URL = PARLIAMENT_URL + WEB_INITIATIVES_PATH
var API_INITIATIVES_PATH = "/api/documents/collective-addresses"
var API_INITIATIVES_URL = "https://api.riigikogu.ee" + API_INITIATIVES_PATH
var INITIATIVE_UUID = "c5c91e62-124b-41a4-9f37-6f80f8cab5ab"
var DOCUMENT_UUID = "e519fd6f-584a-4f0e-9434-6d7c6dfe4865"
var FILE_UUID = "a8dd7913-0816-4e46-9b5a-c661a2eb97de"
var VOLUME_UUID = "ca9c364f-25b2-4162-a9af-d4e6932d502f"
var EXAMPLE_BUFFER = Buffer.from("\x0d\x25")

describe("ParliamentWebSyncCli", function() {
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/time")()
	beforeEach(require("root/test/mitm").router)

	it("must request from parliament", function*() {
		var webUrl = Url.parse(WEB_INITIATIVES_URL)
		var apiUrl = Url.parse(API_INITIATIVES_URL)

		this.router.get(webUrl.path, function(req, res) {
			req.headers.host.must.equal(webUrl.host)
			respond(<Page />, req, res)
		})

		this.router.get(apiUrl.path, function(req, res) {
			req.headers.host.must.equal(apiUrl.host)
			respond([], req, res)
		})

		yield job()
	})

	it("must create external initiative with events and files", function*() {
		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td>Kollektiivne pöördumine<br />„Teeme elu paremaks”</td>
				<td><a href="http://example.com/john">John Smith</a></td>
				<td><a href="http://example.com/committee">Keskkonnakomisjon</a></td>

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
						Kollektiivne pöördumine
					</a></li>
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			created: "2015-06-16T13:37:42",

			files: [{
				uuid: FILE_UUID,
				fileName: "algatus.pdf",
				accessRestrictionType: "PUBLIC",
				created: "2015-02-06T13:53:36.678"
			}]
		}))

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
		)

		yield job()

		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([new ValidInitiative({
			uuid: INITIATIVE_UUID,
			external: true,
			created_at: new Date(2015, 5, 16, 13, 37, 42),
			title: "Elu Tallinnas paremaks tegemiseks",
			author_name: "John Smith",
			phase: "parliament",
			received_by_parliament_at: new Date(2015, 5, 16, 13, 37, 42),
			accepted_by_parliament_at: new Date(2015, 5, 18),
			parliament_uuid: INITIATIVE_UUID,
			parliament_committee: "Keskkonnakomisjon",
			parliament_api_data: initiatives[0].parliament_api_data,
			parliament_synced_at: new Date
		})])

		yield eventsDb.search(sql`
			SELECT * FROM initiative_events
		`).must.then.be.empty()

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.eql([new ValidFile({
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			external_id: FILE_UUID,
			external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
			name: "algatus.pdf",
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${INITIATIVE_UUID}`,
			content: Buffer.from("PDF"),
			content_type: new MediaType("application/pdf")
		})])
	})

	it("must create external initiative as done and archived if finished",
		function*() {
		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td>Kollektiivne pöördumine<br />„Teeme elu paremaks”</td>
				<td><a href="http://example.com/john">John Smith</a></td>
				<td><a href="http://example.com/committee">Keskkonnakomisjon</a></td>

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
						Kollektiivne pöördumine
					</a></li>
				</ul></td>

				<td>20.06.2015</td>
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			created: "2015-06-16T13:37:42"
		}))

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
		)

		yield job()

		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([new ValidInitiative({
			uuid: INITIATIVE_UUID,
			external: true,
			created_at: new Date(2015, 5, 16, 13, 37, 42),
			title: "Elu Tallinnas paremaks tegemiseks",
			author_name: "John Smith",
			phase: "done",
			received_by_parliament_at: new Date(2015, 5, 16, 13, 37, 42),
			accepted_by_parliament_at: new Date(2015, 5, 18),
			finished_in_parliament_at: new Date(2015, 5, 20),
			parliament_uuid: INITIATIVE_UUID,
			parliament_committee: "Keskkonnakomisjon",
			parliament_api_data: initiatives[0].parliament_api_data,
			parliament_synced_at: new Date,
			archived_at: new Date
		})])

		yield eventsDb.search(sql`
			SELECT * FROM initiative_events
		`).must.then.be.empty()

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.be.empty()
	})

	it("must strip quotes from title on an external initiative", function*() {
		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td>Kollektiivne pöördumine<br />„Lageraied Ajalukku”</td>
				<td><a href="http://example.com/john">John Smith</a></td>
				<td><a href="http://example.com/committee">Keskkonnakomisjon</a></td>

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
						Kollektiivne pöördumine
					</a></li>
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			uuid: INITIATIVE_UUID,
			title: "Kollektiivne pöördumine \"Lageraied Ajalukku\"",
			created: "2015-06-16T13:37:42"
		}))

		yield job()
		var initiative = yield initiativesDb.read(INITIATIVE_UUID)
		initiative.title.must.equal("Lageraied Ajalukku")
	})

	it("must update local initiative with events and files", function*() {
		var author = yield createUser()

		var initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: author.id,
			phase: "government"
		}))

		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td>Kollektiivne pöördumine<br />„Teeme elu paremaks”</td>
				<td><a href={`https://rahvaalgatus.ee/initiatives/${initiative.uuid}`}>
					John Smith
				</a></td>
				<td><a href="http://example.com/committee">Keskkonnakomisjon</a></td>

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${DOCUMENT_UUID}`}>
						Kollektiivne pöördumine
					</a></li>
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
			uuid: DOCUMENT_UUID,
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			created: "2015-06-16T13:37:42",

			files: [{
				uuid: FILE_UUID,
				fileName: "algatus.pdf",
				accessRestrictionType: "PUBLIC",
				created: "2015-02-06T13:53:36.678"
			}]
		}))

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
		)

		yield job()

		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([{
			__proto__: initiative,
			author_name: "John Smith",
			received_by_parliament_at: new Date(2015, 5, 16, 13, 37, 42),
			accepted_by_parliament_at: new Date(2015, 5, 18),
			parliament_uuid: DOCUMENT_UUID,
			parliament_committee: "Keskkonnakomisjon",
			parliament_api_data: initiatives[0].parliament_api_data,
			parliament_synced_at: new Date
		}])

		yield eventsDb.search(sql`
			SELECT * FROM initiative_events
		`).must.then.be.empty()

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.eql([new ValidFile({
			id: 1,
			initiative_uuid: initiative.uuid,
			external_id: FILE_UUID,
			external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
			name: "algatus.pdf",
			title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
			url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
			content: Buffer.from("PDF"),
			content_type: new MediaType("application/pdf")
		})])
	})

	_.each({
		"/initiatives/:uuid": `https://rahvaalgatus.ee/initiatives/:uuid`,
		"/initiatives/:uuid/vote": `https://rahvaalgatus.ee/initiatives/:uuid/vote`,
		"/topics/:uuid/vote": `https://rahvaalgatus.ee/topics/:uuid/vote`,

		"/topics/:uuid/votes/:voteUuid":
			`https://rahvaalgatus.ee/topics/:uuid/votes/${newUuid()}`
	}, function(url, title) {
		it("must update local initiative if URL in the style of " + title,
			function*() {
			var author = yield createUser()

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: author.id,
				phase: "government"
			}))

			this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
				<tr>
					<td>18.06.2015</td>
					<td>Kollektiivne pöördumine<br />„Teeme elu paremaks”</td>
					<td><a href={url.replace(":uuid", initiative.uuid)}>John</a></td>
					<td />

					<td><ul>
						<li><a href={`${DOCUMENT_URL}/${DOCUMENT_UUID}`}>
							Kollektiivne pöördumine
						</a></li>
					</ul></td>

					<td />
				</tr>
			</Page>))

			this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

			this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
				uuid: DOCUMENT_UUID,
				title: "Kollektiivne pöördumine elu Tallinnas paremaks tegemiseks",
				created: "2015-06-16T13:37:42"
			}))

			yield job()

			var initiatives = yield initiativesDb.search(sql`
				SELECT * FROM initiatives
			`)

			initiatives.must.eql([{
				// NOTE: Phase isn't updated for existing initiatives.
				__proto__: initiative,
				author_name: "John",
				received_by_parliament_at: new Date(2015, 5, 16, 13, 37, 42),
				accepted_by_parliament_at: new Date(2015, 5, 18),
				parliament_uuid: DOCUMENT_UUID,
				parliament_api_data: initiatives[0].parliament_api_data,
				parliament_synced_at: new Date
			}])
		})
	})

	it("must not create initiatives that are in the Parliament API",
		function*() {
		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>17.06.2015</td>
				<td />
				<td />
				<td />

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
						Kollektiivne pöördumine
					</a></li>
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, [{
			uuid: INITIATIVE_UUID
		}]))

		yield job()

		yield initiativesDb.search(sql`
			SELECT * FROM initiatives
		`).must.then.be.empty()
	})

	_.each({
		"acceptance document": [{
			uuid: INITIATIVE_UUID,
			created: "2015-06-16T13:37:42",
			relatedDocuments: [{uuid: DOCUMENT_UUID}]
		}, {
			[DOCUMENT_UUID]: {
				uuid: DOCUMENT_UUID,
				title: "Kollektiivse pöördumise menetlusse võtmine",
				created: "2015-06-17T13:37:42.666",
				documentType: "decisionDocument",

				files: [{
					uuid: FILE_UUID,
					fileName: "70_17.06.2019_pöördumine.pdf",
					accessRestrictionType: "PUBLIC",
					created: "2015-06-17T12:47:30.594"
				}]
			}
		}, {
			phase: "parliament",
			received_by_parliament_at: new Date(2015, 5, 16, 13, 37, 42),
			accepted_by_parliament_at: new Date(2015, 5, 18)
		}, {
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			occurred_at: new Date(2015, 5, 17, 13, 37, 42, 666),
			origin: "parliament",
			external_id: "MENETLUSSE_VOETUD",
			type: "parliament-accepted",
			title: null,
			content: {},
		}, [{
			id: 1,
			event_id: 1,
			initiative_uuid: INITIATIVE_UUID,
			external_id: FILE_UUID,
			name: "70_17.06.2019_pöördumine.pdf",
			title: "Kollektiivse pöördumise menetlusse võtmine",
			url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
			content: EXAMPLE_BUFFER,
			content_type: new MediaType("application/octet-stream")
		}]],

		"response letter": [{
			uuid: INITIATIVE_UUID,
			created: "2015-06-16T13:37:42",
			relatedDocuments: [{uuid: DOCUMENT_UUID}]
		}, {
			[DOCUMENT_UUID]: {
				uuid: DOCUMENT_UUID,
				title: "ÕIGK vastuskiri - Kollektiivne pöördumine X",
				created: "2015-06-18T13:37:42.666",
				documentType: "letterDocument",
				direction: {code: "VALJA"},

				files: [{
					uuid: FILE_UUID,
					fileName: "ÕIGK_11062019.pdf",
					accessRestrictionType: "PUBLIC"
				}]
			}
		}, {
			phase: "parliament",
			received_by_parliament_at: new Date(2015, 5, 16, 13, 37, 42),
			accepted_by_parliament_at: new Date(2015, 5, 18)
		}, {
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
			origin: "parliament",
			external_id: "MENETLUS_LOPETATUD",
			type: "parliament-finished",
			title: null,
			content: null
		}, [{
			id: 1,
			event_id: 1,
			initiative_uuid: INITIATIVE_UUID,
			external_id: FILE_UUID,
			name: "ÕIGK_11062019.pdf",
			title: "ÕIGK vastuskiri - Kollektiivne pöördumine X",
			url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
			content: EXAMPLE_BUFFER,
			content_type: new MediaType("application/octet-stream")
		}]],

		"committee meeting protocol": [{
			uuid: INITIATIVE_UUID,
			created: "2015-06-16T13:37:42",
			relatedDocuments: [{uuid: DOCUMENT_UUID}]
		}, {
			[DOCUMENT_UUID]: {
				uuid: DOCUMENT_UUID,
				title: "Protokoll",
				created: "2015-06-19T12:34:56.666",
				documentType: "protokoll",

				volume: {
					uuid: VOLUME_UUID,
					title: "Komisjoni istung teisipäev, 18.06.2015 13:37",
					reference: "4-8/KEKK/13-4",
					volumeType: "unitSittingVolume"
				},

				files: [{
					uuid: FILE_UUID,
					fileName: "Protokoll.pdf",
					accessRestrictionType: "PUBLIC"
				}]
			}
		}, {
			phase: "parliament",
			received_by_parliament_at: new Date(2015, 5, 16, 13, 37, 42),
			accepted_by_parliament_at: new Date(2015, 5, 18)
		}, {
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			occurred_at: new Date(2015, 5, 18, 13, 37),
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/2015-06-18",
			type: "parliament-committee-meeting",
			title: null,
			content: {committee: "Keskkonnakomisjon", invitees: null}
		}, [{
			id: 1,
			event_id: 1,
			initiative_uuid: INITIATIVE_UUID,
			external_id: FILE_UUID,
			name: "Protokoll.pdf",
			title: "Protokoll",
			url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
			content: EXAMPLE_BUFFER,
			content_type: new MediaType("application/octet-stream")
		}]]
	}, function(test, title) {
		var document = test[0]
		var documents = test[1]
		var attrs = test[2]
		var events = test[3]
		var files = test[4]

		it("must create events and files given " + title, function*() {
			var author = yield createUser()

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: author.id,
				uuid: INITIATIVE_UUID,
				parliament_uuid: INITIATIVE_UUID,
				phase: "parliament"
			}))

			this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
				<tr>
					<td>18.06.2015</td>
					<td />
					<td />
					<td />

					<td><ul>
						<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
							Kollektiivne pöördumine
						</a></li>
					</ul></td>

					<td />
				</tr>
			</Page>))

			this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

			this.router.get(`/api/documents/${INITIATIVE_UUID}`,
				respond.bind(null, document))

			_.each(documents, (document, uuid) => (
				this.router.get(`/api/documents/${uuid}`, respond.bind(null, document))
			))

			flatten(_.map(documents, (doc) => doc.files)).map((file) => (
				this.router.get(`/download/${file.uuid}`,
					respondWithRiigikoguDownload.bind(null,
						"application/octet-stream",
						"\x0d\x25"
					)
				)
			))

			yield job()

			var updated = yield initiativesDb.read(sql`SELECT * FROM initiatives`)

			updated.must.eql(_.assign({
				__proto__: initiative,
				parliament_api_data: updated.parliament_api_data,
				parliament_synced_at: new Date
			}, attrs))

			yield eventsDb.search(sql`
				SELECT * FROM initiative_events
			`).must.then.eql(concat(events).map((ev) => new ValidEvent(ev)))

			yield filesDb.search(sql`
				SELECT * FROM initiative_files
			`).must.then.eql(files.map((file) => new ValidFile({
				__proto__: file,
				external_url: PARLIAMENT_URL + "/download/" + file.external_id
			})))
		})
	})

	it("must consider documents from HTML along with API's", function*() {
		var author = yield createUser()

		var initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: author.id,
			uuid: INITIATIVE_UUID,
			parliament_uuid: INITIATIVE_UUID,
			phase: "parliament"
		}))

		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td />
				<td />
				<td />

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
						Kollektiivne pöördumine
					</a></li>

					<li><a href={`${DOCUMENT_URL}/${DOCUMENT_UUID}`}>
						Kollektiivse pöördumise menetlusse võtmine
					</a></li>
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			uuid: INITIATIVE_UUID,
			created: "2015-06-16T13:37:42"
		}))

		this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
			uuid: DOCUMENT_UUID,
			title: "Kollektiivse pöördumise menetlusse võtmine",
			created: "2015-06-17T13:37:42.666",
			documentType: "decisionDocument",

			files: [{
				uuid: FILE_UUID,
				fileName: "70_17.06.2019_pöördumine.pdf",
				accessRestrictionType: "PUBLIC",
				created: "2015-06-17T12:47:30.594"
			}]
		}))

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null,
				"application/octet-stream",
				"\x0d\x25"
			)
		)

		yield job()

		var updated = yield initiativesDb.read(sql`SELECT * FROM initiatives`)

		updated.must.eql({
			__proto__: initiative,
			received_by_parliament_at: new Date(2015, 5, 16, 13, 37, 42),
			accepted_by_parliament_at: new Date(2015, 5, 18),
			parliament_api_data: updated.parliament_api_data,
			parliament_synced_at: new Date
		})

		yield eventsDb.search(sql`
			SELECT * FROM initiative_events
		`).must.then.eql([new ValidEvent({
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			occurred_at: new Date(2015, 5, 17, 13, 37, 42, 666),
			origin: "parliament",
			external_id: "MENETLUSSE_VOETUD",
			type: "parliament-accepted",
			title: null,
			content: {},
		})])

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.eql([new ValidFile({
			id: 1,
			event_id: 1,
			initiative_uuid: INITIATIVE_UUID,
			external_id: FILE_UUID,
			external_url: PARLIAMENT_URL + "/download/" + FILE_UUID,
			name: "70_17.06.2019_pöördumine.pdf",
			title: "Kollektiivse pöördumise menetlusse võtmine",
			url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
			content: EXAMPLE_BUFFER,
			content_type: new MediaType("application/octet-stream")
		})])
	})

	it("must consider volume containing the initiative document", function*() {
		// NOTE: The trailing path separator is intentional, as that's what
		// "Glüfosaadi kasutamine tuleb Eestis keelata"'s volume has on
		// https://www.riigikogu.ee/tutvustus-ja-ajalugu/raakige-kaasa/esitage-kollektiivne-poordumine/riigikogule-esitatud-kollektiivsed-poordumised/.
		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td />
				<td />
				<td />

				<td><ul>
					<li><a href={`${VOLUME_URL}/${VOLUME_UUID}/`}>
						Kollektiivne pöördumine
					</a></li>
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		var responseUuid = newUuid()
		var responseFileUuid = newUuid()

		this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
			uuid: VOLUME_UUID,
			title: "Kollektiivne pöördumine Elu paremaks!",
			volumeType: "letterVolume",
			created: "2015-06-18T13:37:42.666",

			documents: [{
				uuid: INITIATIVE_UUID,
				title: "Kollektiivne pöördumine Elu paremaks!",
				documentType: "letterDocument"
			}, {
				uuid: responseUuid
			}]
		}))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			uuid: INITIATIVE_UUID,
			created: "2015-06-16T13:37:42",
			title: "Kollektiivne pöördumine Elu paremaks!",
			volume: {uuid: VOLUME_UUID},
			documentType: "letterDocument",

			files: [{
				uuid: FILE_UUID,
				fileName: "algatus.pdf",
				accessRestrictionType: "PUBLIC",
				created: "2015-06-18T13:37:42.666",
			}]
		}))

		this.router.get(`/api/documents/${responseUuid}`, respond.bind(null, {
			uuid: responseUuid,
			created: "2015-06-19T13:37:42",
			title: "Vastuskiri kollektiivsele pöördumisele - Elu paremaks!",
			documentType: "letterDocument",
			direction: {code: "VALJA"},

			files: [{
				uuid: responseFileUuid,
				fileName: "vastuskiri.pdf",
				accessRestrictionType: "PUBLIC",
				created: "2015-06-19T13:37:42.666",
			}]
		}))

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "INITIATIVE")
		)

		this.router.get(`/download/${responseFileUuid}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "RESPONSE")
		)

		yield job()

		var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

		initiatives.must.eql([new ValidInitiative({
			uuid: INITIATIVE_UUID,
			external: true,
			created_at: new Date(2015, 5, 16, 13, 37, 42),
			title: "Elu paremaks!",
			phase: "parliament",
			received_by_parliament_at: new Date(2015, 5, 16, 13, 37, 42),
			accepted_by_parliament_at: new Date(2015, 5, 18),
			parliament_uuid: INITIATIVE_UUID,
			parliament_api_data: initiatives[0].parliament_api_data,
			parliament_synced_at: new Date
		})])

		var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)

		events.must.eql([new ValidEvent({
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			occurred_at: new Date(2015, 5, 19, 13, 37, 42),
			origin: "parliament",
			external_id: "MENETLUS_LOPETATUD",
			type: "parliament-finished",
			title: null,
			content: null
		})])

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.eql([new ValidFile({
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			external_id: FILE_UUID,
			external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
			name: "algatus.pdf",
			title: "Kollektiivne pöördumine Elu paremaks!",
			url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${INITIATIVE_UUID}`,
			content: Buffer.from("INITIATIVE"),
			content_type: new MediaType("application/pdf")
		}), new ValidFile({
			id: 2,
			event_id: 1,
			initiative_uuid: INITIATIVE_UUID,
			external_id: responseFileUuid,
			external_url: `https://www.riigikogu.ee/download/${responseFileUuid}`,
			name: "vastuskiri.pdf",
			title: "Vastuskiri kollektiivsele pöördumisele - Elu paremaks!",
			url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${responseUuid}`,
			content: Buffer.from("RESPONSE"),
			content_type: new MediaType("application/pdf")
		})])
	})

	it("must consider volumes from HTML along with API's", function*() {
		var author = yield createUser()

		var initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: author.id,
			uuid: INITIATIVE_UUID,
			parliament_uuid: INITIATIVE_UUID,
			phase: "parliament"
		}))

		// NOTE: Note the path component after VOLUME_UUID. This is the case for
		// the oldest initiative "Lõpetada erakondade ületoitmine" on
		// https://www.riigikogu.ee/tutvustus-ja-ajalugu/raakige-kaasa/esitage-kollektiivne-poordumine/riigikogule-esitatud-kollektiivsed-poordumised/.
		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td />
				<td />
				<td />

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
						Kollektiivne pöördumine
					</a></li>

					<li><a href={`${VOLUME_URL}/${VOLUME_UUID}/Kollektiivse kohta`}>
						Arupärimine 18.06.2015
					</a></li>
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			uuid: INITIATIVE_UUID,
			created: "2015-06-16T13:37:42"
		}))

		this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
			uuid: VOLUME_UUID,
			title: "Kollektiivse pöördumise \"Elu paremaks!\" kohta",
			volumeType: "interpellationsVolume",
			created: "2015-06-18T13:37:42.666",

			documents: [
				{uuid: DOCUMENT_UUID, documentType: "interpellationsDocument"}
			]
		}))

		this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
			uuid: DOCUMENT_UUID,
			title: "Kollektiivse pöördumise \"Elu paremaks!\" kohta",
			documentType: "interpellationsDocument",

			submittingDate: "2016-04-11",
			answerDeadline: "2016-05-31",
			addressee: {value: "justiitsminister John Smith"},

			files: [{
				uuid: FILE_UUID,
				fileName: "Question.pdf",
				accessRestrictionType: "PUBLIC"
			}]
		}))

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
		)

		yield job()

		var updated = yield initiativesDb.read(sql`SELECT * FROM initiatives`)

		updated.must.eql({
			__proto__: initiative,
			received_by_parliament_at: new Date(2015, 5, 16, 13, 37, 42),
			accepted_by_parliament_at: new Date(2015, 5, 18),
			parliament_api_data: updated.parliament_api_data,
			parliament_synced_at: new Date
		})

		yield eventsDb.search(sql`
			SELECT * FROM initiative_events
		`).must.then.eql([new ValidEvent({
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			occurred_at: new Date(2015, 5, 18, 13, 37, 42, 666),
			origin: "parliament",
			external_id: VOLUME_UUID,
			type: "parliament-interpellation",
			title: null,

			content: {
				to: "justiitsminister John Smith",
				date: "2016-04-11",
				deadline: "2016-05-31"
			}
		})])

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.eql([new ValidFile({
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			event_id: 1,
			external_id: FILE_UUID,
			external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
			name: "Question.pdf",
			title: "Kollektiivse pöördumise \"Elu paremaks!\" kohta",
			url: DOCUMENT_URL + "/" + DOCUMENT_UUID,
			content: Buffer.from("PDF"),
			content_type: new MediaType("application/pdf")
		})])
	})

	it("must create event for committee meeting agenda item without related volume", function*() {
		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td />
				<td />
				<td />

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
						Kollektiivne pöördumine
					</a></li>
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			uuid: INITIATIVE_UUID,
			created: "2015-06-16T13:37:42",
			relatedDocuments: [{uuid: DOCUMENT_UUID}]
		}))

		this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
			uuid: DOCUMENT_UUID,
			title: "Kollektiivne pöördumine haruapteekide säilitamise osas",
			documentType: "unitAgendaItemDocument",
			invitees: "Sotsiaalministeeriumi terviseala asekantsler",
			volume: {uuid: VOLUME_UUID}
		}))

		var minutesUuid = newUuid()

		this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
			uuid: VOLUME_UUID,
			title: "Komisjoni istung teisipäev, 18.06.2015 13:37",
			reference: "1-3/SOTK/3-7",
			volumeType: "unitSittingVolume",

			documents: [{
				uuid: DOCUMENT_UUID,
				title: "Kollektiivne pöördumine haruapteekide säilitamise osas",
				documentType: "unitAgendaItemDocument",
			}, {
				// Include another unitAgendaItemDocument to ensure it doesn't get
				// fetched.
				uuid: newUuid(),
				title: "Muud küsimused",
				documentType: "unitAgendaItemDocument",
			}, {
				uuid: minutesUuid,
				title: "Protokoll",
				documentType: "protokoll"
			}]
		}))

		this.router.get(`/api/documents/${minutesUuid}`, respond.bind(null, {
			uuid: DOCUMENT_UUID,
			title: "Protokoll",
			documentType: "protokoll",

			files: [{
				uuid: FILE_UUID,
				fileName: "Protokoll.pdf",
				accessRestrictionType: "PUBLIC"
			}]
		}))

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
		)

		yield job()

		var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)

		events.must.eql([new ValidEvent({
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			occurred_at: new Date(2015, 5, 18, 13, 37),
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/2015-06-18",
			type: "parliament-committee-meeting",
			title: null,

			content: {
				committee: "Sotsiaalkomisjon",
				invitees: "Sotsiaalministeeriumi terviseala asekantsler"
			}
		})])

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.eql([new ValidFile({
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			event_id: 1,
			external_id: FILE_UUID,
			external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
			name: "Protokoll.pdf",
			title: "Protokoll",
			url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
			content: Buffer.from("PDF"),
			content_type: new MediaType("application/pdf")
		})])
	})

	it("must create event given a volume of committee meeting", function*() {
		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td />
				<td />
				<td />

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
						Kollektiivne pöördumine
					</a></li>
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			uuid: INITIATIVE_UUID,
			created: "2015-06-16T13:37:42",
			relatedVolumes: [{uuid: VOLUME_UUID}]
		}))

		this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
			uuid: VOLUME_UUID,
			title: "Komisjoni istung esmaspäev, 18.06.2015 13:37",
			reference: "1-3/KEKK/3-7",
			volumeType: "unitSittingVolume",

			documents: [{
				// Include a unitAgendaItemDocument to ensure it doesn't get fetched.
				uuid: newUuid(),
				title: "Muud küsimused",
				documentType: "unitAgendaItemDocument",
			}, {
				uuid: DOCUMENT_UUID,
				title: "Protokoll",
				documentType: "protokoll"
			}]
		}))

		this.router.get(`/api/documents/${DOCUMENT_UUID}`, respond.bind(null, {
			uuid: DOCUMENT_UUID,
			title: "Protokoll",
			documentType: "protokoll",
			volume: {uuid: VOLUME_UUID},

			files: [{
				uuid: FILE_UUID,
				fileName: "Protokoll.pdf",
				accessRestrictionType: "PUBLIC"
			}]
		}))

		this.router.get(`/download/${FILE_UUID}`,
			respondWithRiigikoguDownload.bind(null, "application/pdf", "PDF")
		)

		yield job()

		var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)

		events.must.eql([new ValidEvent({
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			occurred_at: new Date(2015, 5, 18, 13, 37),
			origin: "parliament",
			external_id: "ARUTELU_KOMISJONIS/2015-06-18",
			type: "parliament-committee-meeting",
			title: null,
			content: {committee: "Keskkonnakomisjon", invitees: null}
		})])

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.eql([new ValidFile({
			id: 1,
			initiative_uuid: INITIATIVE_UUID,
			event_id: 1,
			external_id: FILE_UUID,
			external_url: `https://www.riigikogu.ee/download/${FILE_UUID}`,
			name: "Protokoll.pdf",
			title: "Protokoll",
			url: `https://www.riigikogu.ee/tegevus/dokumendiregister/dokument/${DOCUMENT_UUID}`,
			content: Buffer.from("PDF"),
			content_type: new MediaType("application/pdf")
		})])
	})

	it("must ignore specific unsupported documents", function*() {
		var author = yield createUser()

		yield initiativesDb.create(new ValidInitiative({
			user_id: author.id,
			uuid: INITIATIVE_UUID,
			parliament_uuid: INITIATIVE_UUID,
			phase: "parliament"
		}))

		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td>Kollektiivne pöördumine<br />„Teeme elu paremaks”</td>
				<td />
				<td />

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
						Kollektiivne pöördumine
					</a></li>

					{[
						"https://www.riigikogu.ee/tegevus/eelnoud/eelnou/aabf2ae4-8ddc-4d46-9449-9548fb2295ce/Ravimiseaduse%20muutmise%20seadus/"
					].map((url) => (<li><a href={url}>Dokument</a></li>))}
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			uuid: INITIATIVE_UUID,
			created: "2015-06-16T13:37:42"
		}))

		yield job()

		yield eventsDb.search(sql`
			SELECT * FROM initiative_events
		`).must.then.be.empty()

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.empty()
	})

	// The parliament page refers to a volume (https://www.riigikogu.ee/tegevus/dokumendiregister/toimikud/65154711-c8f8-4394-8643-7037adedb3ae) that in turn
	// refers to the initiative.
	it("must ignore volumes containing the initiative document ", function*() {
		var author = yield createUser()

		var initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: author.id,
			uuid: INITIATIVE_UUID,
			parliament_uuid: INITIATIVE_UUID,
			phase: "parliament"
		}))

		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td />
				<td />
				<td />

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
						Kollektiivne pöördumine
					</a></li>

					<li><a href={`${VOLUME_URL}/${VOLUME_UUID}`}>
						Vastuskiri
					</a></li>
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, respond.bind(null, {
			uuid: INITIATIVE_UUID,
			created: "2015-06-16T13:37:42"
		}))

		this.router.get(`/api/volumes/${VOLUME_UUID}`, respond.bind(null, {
			uuid: VOLUME_UUID,
			title: "Kollektiivne pöördumine Elu paremaks!",
			volumeType: "letterVolume",
			created: "2015-06-18T13:37:42.666",

			documents: [
				{uuid: INITIATIVE_UUID, documentType: "letterDocument"}
			]
		}))

		yield job()

		var updated = yield initiativesDb.read(sql`SELECT * FROM initiatives`)

		updated.must.eql({
			__proto__: initiative,
			received_by_parliament_at: new Date(2015, 5, 16, 13, 37, 42),
			accepted_by_parliament_at: new Date(2015, 5, 18),
			parliament_api_data: updated.parliament_api_data,
			parliament_synced_at: new Date
		})

		yield eventsDb.search(sql`
			SELECT * FROM initiative_events
		`).must.then.be.empty()

		yield filesDb.search(sql`
			SELECT * FROM initiative_files
		`).must.then.be.empty()
	})

	it("must ignore not found documents", function*() {
		this.router.get(WEB_INITIATIVES_PATH, respond.bind(null, <Page>
			<tr>
				<td>18.06.2015</td>
				<td>Kollektiivne pöördumine<br />„Teeme elu paremaks”</td>
				<td />
				<td />

				<td><ul>
					<li><a href={`${DOCUMENT_URL}/${INITIATIVE_UUID}`}>
						Kollektiivne pöördumine
					</a></li>
				</ul></td>

				<td />
			</tr>
		</Page>))

		this.router.get(API_INITIATIVES_PATH, respond.bind(null, []))

		this.router.get(`/api/documents/${INITIATIVE_UUID}`, function(_req, res) {
			// 500 Internal Server Error is used for 404s...
			// https://github.com/riigikogu-kantselei/api/issues/20
			res.setHeader("Content-Type", "application/json")
			res.statusCode = 500

			res.end(JSON.stringify({
				timestamp: "2015-06-18T13:37:42+0000",
				status: 500,
				error: "Internal Server Error",
				message: `Document not found with UUID: ${INITIATIVE_UUID}`,
				path: `/api/documents/${INITIATIVE_UUID}`
			}))
		})

		yield job()

		yield initiativesDb.search(sql`
			SELECT * FROM initiative_events
		`).must.then.be.empty()
	})
})

function Page(_attrs, children) {
	return <html>
		<body>
			<article class="content">
				<table>
					<thead>
						<tr>
							{/* NOTE: Spaces around headings are intentional. */}
							<td> Menetlusse võetud </td>
							<td> Pealkiri </td>
							<td> Pöördumise esitajad </td>
							<td> Riigikogu komisjon </td>
							<td> Seotud dokumendid </td>
							<td> Menetlus lõpetatud </td>
						</tr>
					</thead>

					<tbody>{children}</tbody>
				</table>
			</article>
		</body>
	</html>
}

function respondWithRiigikoguDownload(contentType, content, req, res) {
	// https://riigikogu.ee redirects to https://www.riigikogu.ee.
	req.headers.host.must.equal("www.riigikogu.ee")
	res.setHeader("Content-Type", contentType)
	res.end(content)
}

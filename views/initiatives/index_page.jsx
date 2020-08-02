/** @jsx Jsx */
var _ = require("lodash")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var {ProgressView} = require("./initiative_page")
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var EMPTY_ARR = Array.prototype
exports = module.exports = InitiativesPage
exports.InitiativesView = InitiativesView

function InitiativesPage(attrs) {
	var t = attrs.t
	var req = attrs.req
	var flash = attrs.flash
	var initiatives = attrs.initiatives
	var signatureCounts = attrs.signatureCounts

	var initiativesByPhase = _.groupBy(initiatives, "phase")
	var inEdit = initiativesByPhase.edit || EMPTY_ARR
	var inSign = initiativesByPhase.sign || EMPTY_ARR
	var inParliament = initiativesByPhase.parliament || EMPTY_ARR
	var inGovernment = initiativesByPhase.government || EMPTY_ARR
	var inDone = initiativesByPhase.done || EMPTY_ARR

	return <Page
		page="initiatives"
		req={req}

		links={[{
			rel: "alternate",
			type: "application/atom+xml",
			title: t("ATOM_INITIATIVE_EVENTS_FEED_TITLE"),
			href: "/initiative-events.atom"
		}]}
	>
		{
			// When deleting an initiative, people get redirected here.
		}
		{flash("notice") ? <section class="secondary-section"><center>
			<p class="flash notice">{flash("notice")}</p>
		</center></section> : null}

		<section id="initiatives" class="secondary-section initiatives-section">
			<center>
				{inEdit.length > 0 ? <Fragment>
					<h2>{t("EDIT_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="edit"
						initiatives={inEdit}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inSign.length > 0 ? <Fragment>
					<h2>{t("SIGN_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="sign"
						initiatives={inSign}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inParliament.length > 0 ? <Fragment>
					<h2>{t("PARLIAMENT_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="parliament"
						initiatives={inParliament}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inGovernment.length > 0 ? <Fragment>
					<h2>{t("GOVERNMENT_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="government"
						initiatives={inGovernment}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inDone.length > 0 ? <Fragment>
					<h2>{t("DONE_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="done"
						initiatives={inDone}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}
			</center>
		</section>
	</Page>
}

function InitiativesView(attrs) {
	var t = attrs.t
	var phase = attrs.phase
	var initiatives = attrs.initiatives
	var signatureCounts = attrs.signatureCounts

	switch (phase) {
		case undefined: break

		case "edit":
			initiatives = _.sortBy(initiatives, "created_at").reverse()
			break

		case "sign":
			initiatives = _.sortBy(initiatives, (i) => i.signature_count != null
				? i.signature_count
				: signatureCounts[i.uuid] || 0
			).reverse()
			break

		case "parliament":
			initiatives = _.sortBy(initiatives, (i) => (
				i.sent_to_parliament_at || i.signing_started_at
			)).reverse()
			break
			
		case "government":
			initiatives = _.sortBy(initiatives, "sent_to_government_at")
			break

		case "done":
			initiatives = _.sortBy(initiatives, (i) => (
				i.finished_in_government_at || i.finished_in_parliament_at
			)).reverse()
			break

		default: throw new RangeError("Invalid phase: " + phase)
	}

	return <ol class="initiatives">
		{initiatives.map((initiative) => <InitiativeView
			t={t}
			initiative={initiative}

			signatureCount={initiative.signature_count != null
				? initiative.signature_count
				: signatureCounts[initiative.uuid] || 0
			}
		/>)}
	</ol>
}

function InitiativeView(attrs) {
	var t = attrs.t
	var initiative = attrs.initiative
	var signatureCount = attrs.signatureCount

	var time = (
		initiative.phase == "edit" ? initiative.created_at :
		initiative.phase == "sign" ? initiative.signing_started_at :
		initiative.phase == "parliament" ? (
			initiative.received_by_parliament_at ||
			initiative.sent_to_parliament_at
		) :
		initiative.phase == "government" ? initiative.sent_to_government_at :
		initiative.phase == "done" ? (
			initiative.finished_in_government_at ||
			initiative.finished_in_parliament_at
		) :
		null
	)

	var badge = _.find(Config.badges, (_b, tag) => initiative.tags.includes(tag))

	return <li
		data-uuid={initiative.uuid}
		class={"initiative" + (initiative.destination ? " with-destination" : "")}
	>
		<a href={`/initiatives/${initiative.uuid}`}>
			<time datetime={time && time.toJSON()}>
				{time ? I18n.formatDate("numeric", time) : " "}
			</time>{" "}

			{initiative.destination ? <span class="destination">
				{t("DESTINATION_" + initiative.destination)}
			</span> : null}

			<h3 lang="et">{initiative.title}</h3>
			{badge ? <img src={badge.icon} class="badge" title={badge.name} /> : null}

			<span class="author">
				{[
					initiative.author_name,
					initiative.user_name
				].filter(Boolean).join(", ")}
			</span>

			<ProgressView
				t={t}
				initiative={initiative}
				signatureCount={signatureCount}
			/>
		</a>
	</li>
}

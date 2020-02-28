/** @jsx Jsx */
var _ = require("lodash")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("./page")
var ProgressView = require("./initiatives/initiative_page").ProgressView
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var EMPTY_ARR = Array.prototype
exports = module.exports = InitiativesPage
exports.InitiativesView = InitiativesView

function InitiativesPage(attrs) {
	var t = attrs.t
	var req = attrs.req
	var flash = attrs.flash
	var recentInitiatives = attrs.recentInitiatives
	var initiatives = attrs.initiatives
	var topics = attrs.topics
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

		{recentInitiatives.length > 0 ? <section
			id="recent-initiatives"
			class="primary-section initiatives-section"
		><center>
			<h2>{t("RECENT_INITIATIVES")}</h2>

			<InitiativesView
				t={t}
				initiatives={recentInitiatives}
				topics={topics}
				signatureCounts={signatureCounts}
			/>
		</center></section> : null}

		<section id="initiatives" class="secondary-section initiatives-section">
			<center>
				{inEdit.length > 0 ? <Fragment>
					<h2>{t("EDIT_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="edit"
						initiatives={inEdit}
						topics={topics}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inSign.length > 0 ? <Fragment>
					<h2>{t("SIGN_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="sign"
						initiatives={inSign}
						topics={topics}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inParliament.length > 0 ? <Fragment>
					<h2>{t("PARLIAMENT_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="parliament"
						initiatives={inParliament}
						topics={topics}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inGovernment.length > 0 ? <Fragment>
					<h2>{t("GOVERNMENT_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="government"
						initiatives={inGovernment}
						topics={topics}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inDone.length > 0 ? <Fragment>
					<h2>{t("DONE_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="done"
						initiatives={inDone}
						topics={topics}
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
	var topics = attrs.topics
	var signatureCounts = attrs.signatureCounts

	switch (phase) {
		case undefined: break

		case "edit":
			initiatives = _.sortBy(initiatives, "created_at").reverse()
			break

		case "sign":
			initiatives = _.sortBy(initiatives, (i) => signatureCounts[i.uuid] || 0)
			initiatives = initiatives.reverse()
			break

		case "parliament":
			initiatives = _.sortBy(initiatives, (i) => (
				i.sent_to_parliament_at ||
				topics[i.uuid] && topics[i.uuid].vote.createdAt
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
			topic={topics[initiative.uuid]}
			signatureCount={signatureCounts[initiative.uuid] || 0}
		/>)}
	</ol>
}

function InitiativeView(attrs) {
	var t = attrs.t
	var topic = attrs.topic
	var initiative = attrs.initiative
	var signatureCount = attrs.signatureCount

	var time = (
		initiative.phase == "edit" ? initiative.created_at || topic.createdAt :
		initiative.phase == "sign" ? topic.vote.createdAt :
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

	var badge = topic && (
		Config.partners[topic.sourcePartnerId] ||
		_.values(_.pick(Config.categories, topic.categories))[0]
	)

	return <li
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
				topic={topic}
				initiative={initiative}
				signatureCount={signatureCount}
			/>
		</a>
	</li>
}

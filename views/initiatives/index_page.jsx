/** @jsx Jsx */
var _ = require("lodash")
var Jsx = require("j6pack")
var {Fragment} = Jsx
var DateFns = require("date-fns")
var Config = require("root").config
var Page = require("../page")
var {Section} = require("../page")
var {ProgressView} = require("./initiative_page")
var {DateView} = Page
var {RelativeDateView} = Page
var I18n = require("root/lib/i18n")
var EMPTY_ARR = Array.prototype
var {renderAuthorName} = require("./initiative_page")
exports = module.exports = InitiativesPage
exports.InitiativeBoxesView = InitiativeBoxesView
exports.InitiativeBoxView = InitiativeBoxView

function InitiativesPage(attrs) {
	var {t} = attrs
	var {req} = attrs
	var {flash} = attrs
	var {initiatives} = attrs

	var initiativesByPhase = _.groupBy(initiatives, "phase")
	var inEdit = initiativesByPhase.edit || EMPTY_ARR
	var inSign = initiativesByPhase.sign || EMPTY_ARR
	var inParliament = initiativesByPhase.parliament || EMPTY_ARR
	var inGovernment = initiativesByPhase.government || EMPTY_ARR
	var inDone = initiativesByPhase.done || EMPTY_ARR

	var {onlyDestinations} = attrs
	var isFiltered = onlyDestinations.length > 0

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
		{flash("notice") ? <Section class="secondary-section">
			<p class="flash notice">{flash("notice")}</p>
		</Section> : null}

		{isFiltered ? <Section id="filter" class="primary-section">
			<h1>
				{onlyDestinations.map((dest) => t("DESTINATION_" + dest)).join(", ")}
			</h1>
		</Section> : null}

		<Section id="initiatives" class="secondary-section initiative-list-section">
			{inEdit.length > 0 ? <Fragment>
				<h2 class="edit-phase">{t("EDIT_PHASE")}</h2>

				<InitiativeListView
					t={t}
					phase="edit"
					initiatives={inEdit}
				/>
			</Fragment> : null}

			{inSign.length > 0 ? <Fragment>
				<h2 class="sign-phase">{t("SIGN_PHASE")}</h2>

				<InitiativeListView
					t={t}
					phase="sign"
					initiatives={inSign}
				/>
			</Fragment> : null}

			{inParliament.length > 0 ? <Fragment>
				<h2 class="parliament-phase">{t("PARLIAMENT_PHASE")}</h2>

				<InitiativeListView
					t={t}
					phase="parliament"
					initiatives={inParliament}
				/>
			</Fragment> : null}

			{inGovernment.length > 0 ? <Fragment>
				<h2 class="government-phase">{t("GOVERNMENT_PHASE")}</h2>

				<InitiativeListView
					t={t}
					phase="government"
					initiatives={inGovernment}
				/>
			</Fragment> : null}

			{inDone.length > 0 ? <Fragment>
				<h2 class="done-phase">{t("DONE_PHASE")}</h2>

				<InitiativeListView
					t={t}
					phase="done"
					initiatives={inDone}
				/>
			</Fragment> : null}
		</Section>
	</Page>
}

function sortForPhase(phase, initiatives) {
	switch (phase) {
		case "edit": return _.sortBy(initiatives, "created_at").reverse()

		case "sign":
			return _.sortBy(initiatives, (i) => i.signature_count || 0).reverse()

		case "parliament":
			return _.sortBy(initiatives, (i) => (
				i.sent_to_parliament_at || i.signing_started_at
			)).reverse()

		case "government": return _.sortBy(initiatives, "sent_to_government_at")

		case "done":
			return _.sortBy(initiatives, (i) => (
				i.finished_in_government_at || i.finished_in_parliament_at
			)).reverse()

		default: throw new RangeError("Invalid phase: " + phase)
	}
}

function InitiativeListView(attrs) {
	var {t} = attrs
	var {phase} = attrs
	var {initiatives} = attrs
	initiatives = phase ? sortForPhase(phase, initiatives) : initiatives

	return <ol class="initiatives">
		{initiatives.map((initiative) => <InitiativeRowView
			t={t}
			initiative={initiative}
			signatureCount={initiative.signature_count}
		/>)}
	</ol>
}

function InitiativeRowView(attrs) {
	var {t} = attrs
	var {initiative} = attrs
	var {signatureCount} = attrs

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
	var authorName = renderAuthorName(initiative)

	return <li
		data-uuid={initiative.uuid}
		class={"initiative" + (initiative.destination ? " with-destination" : "")}
	>
		<a href={`/initiatives/${initiative.uuid}`}>
			<time class="initiative-time" datetime={time && time.toJSON()}>
				{time ? I18n.formatDate("numeric", time) : " "}
			</time>

			{" "}

			<span class="destination">{initiative.destination
				? t("DESTINATION_" + initiative.destination)
				: " "
			}</span>

			<div class="status">
				<ProgressView
					t={t}
					initiative={initiative}
					signatureCount={signatureCount}
				/>

				<ProgressTextView />
			</div>

			<h3 lang="et">{initiative.title}</h3>
			{badge ? <img src={badge.icon} class="badge" title={badge.name} /> : null}
			<span class="author" title={authorName}>{authorName}</span>

			<ProgressView
				t={t}
				initiative={initiative}
				class="narrow-initiative-progress"
				signatureCount={signatureCount}
			/>
		</a>
	</li>

	function ProgressTextView() {
		switch (initiative.phase) {
			case "edit": return <p>
				<span>
					{t("DISCUSSION_DEADLINE")}
					{": "}
					<time datetime={initiative.discussion_ends_at.toJSON()}>
						{I18n.formatDateTime(
							"numeric",
							DateFns.addMilliseconds(initiative.discussion_ends_at, -1)
						)}
					</time>
				</span>
			</p>

			case "sign": return <p>
				<span>
					{t("VOTING_DEADLINE")}
					{": "}
					<time datetime={initiative.signing_ends_at.toJSON()} class="deadline">
						{I18n.formatDateTime(
							"numeric",
							DateFns.addMilliseconds(initiative.signing_ends_at, -1)
						)}
					</time>.
				</span>
			</p>

			default: return null
		}
	}
}

function InitiativeBoxesView(attrs) {
	var {t} = attrs
	var {phase} = attrs
	var {initiatives} = attrs
	initiatives = phase ? sortForPhase(phase, initiatives) : initiatives

	return <ol id={attrs.id} class="initiatives">
		{initiatives.map((initiative) => <InitiativeBoxView
			t={t}
			initiative={initiative}
			signatureCount={initiative.signature_count}
		/>)}
	</ol>
}

function InitiativeBoxView(attrs) {
	var {t} = attrs
	var {initiative} = attrs
	var {signatureCount} = attrs

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
	var authorName = renderAuthorName(initiative)

	return <li
		data-uuid={initiative.uuid}
		class={"initiative" + (initiative.destination ? " with-destination" : "")}
	>
		<a href={`/initiatives/${initiative.uuid}`}>
			{attrs.dateless ? null
				: initiative.phase == "sign"
				? (new Date < initiative.signing_ends_at ?
					<RelativeDateView t={t} date={initiative.signing_ends_at} />
				: null)
				: time
				? <DateView date={time} />
				// Empty <time> so destinationless discussions' titles align properly.
				: <time>&nbsp;</time>
			}

			{" "}

			{initiative.destination ? <span
				class="destination"
				title={t("DESTINATION_" + initiative.destination)}
			>
				{t("DESTINATION_" + initiative.destination)}
			</span> : null}

			<h3 lang="et" title={initiative.title}>{initiative.title}</h3>
			{badge ? <img src={badge.icon} class="badge" title={badge.name} /> : null}
			<span class="author" title={authorName}>{authorName}</span>

			<ProgressView
				t={t}
				initiative={initiative}
				signatureCount={signatureCount}
			/>
		</a>

		{attrs.note ? <div class="note">
			{attrs.note}
		</div> : null}
	</li>
}

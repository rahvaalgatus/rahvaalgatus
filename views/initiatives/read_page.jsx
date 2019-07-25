/** @jsx Jsx */
var _ = require("root/lib/underscore")
var O = require("oolong")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Time = require("root/lib/time")
var DateFns = require("date-fns")
var InitiativePage = require("./initiative_page")
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var Flash = require("../page").Flash
var Initiative = require("root/lib/initiative")
var ProgressView = require("./initiative_page").ProgressView
var Form = require("../page").Form
var FormButton = require("../page").FormButton
var DonateForm = require("../donations/create_page").DonateForm
var CommentView = require("./comments/read_page").CommentView
var CommentForm = require("./comments/create_page").CommentForm
var javascript = require("root/lib/jsx").javascript
var confirm = require("root/lib/jsx").confirm
var stringify = require("root/lib/json").stringify
var linkify = require("root/lib/linkify")
var encode = encodeURIComponent
var min = Math.min
var diffInDays = DateFns.differenceInCalendarDays
var PHASES = Initiative.PHASES
var HTTP_URL = /^https?:\/\//i
var EMPTY_ARR = Array.prototype
var EMPTY_ORG = {name: "", url: ""}
var EVENT_NOTIFICATIONS_SINCE = new Date(Config.eventNotificationsSince)

// Kollektiivse pöördumise (edaspidi käesolevas peatükis pöördumine) menetlusse võtmise otsustab Riigikogu juhatus 30 kalendripäeva jooksul kollektiivse pöördumise esitamisest arvates.
//
// https://www.riigiteataja.ee/akt/122122014013?leiaKehtiv#para152b9
var PARLIAMENT_ACCEPTANCE_DEADLINE_IN_DAYS = 30

// Komisjon arutab pöördumist kolme kuu jooksul ning teeb otsuse pöördumise kohta kuue kuu jooksul pöördumise menetlusse võtmisest arvates.
//
// https://www.riigiteataja.ee/akt/122122014013?leiaKehtiv#para152b12
var PARLIAMENT_PROCEEDINGS_DEADLINE_IN_MONTHS = 6

var UI_TRANSLATIONS = O.map(I18n.STRINGS, function(lang) {
	return O.filter(lang, (_value, key) => key.indexOf("HWCRYPTO") >= 0)
})

var FILE_TYPE_ICONS = {
	"text/html": "ra-icon-html",
	"application/pdf": "ra-icon-pdf",
	"application/vnd.ms-powerpoint": "ra-icon-ppt",
	"application/vnd.etsi.asic-e+zip": "ra-icon-ddoc",
	"application/digidoc": "ra-icon-ddoc",

	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		"ra-icon-doc",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		"ra-icon-ppt"
}

var FILE_TYPE_NAMES = {
	"text/html": "HTML",
	"application/pdf": "PDF",
	"application/vnd.etsi.asic-e+zip": "Digidoc",
	"application/vnd.ms-powerpoint": "Microsoft PowerPoint",

	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		"Microsoft Word",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		"Microsoft PowerPoint",

	// https://api.riigikogu.ee/api/files/800ed589-3d0b-4048-9b70-2ff6b0684ed4
	// has its type as "application/digidoc. I've not yet found whether that has
	// ever been a valid MIME type.
	"application/digidoc": "Digidoc"
}

module.exports = function(attrs) {
	var req = attrs.req
	var t = attrs.t
  var lang = req.lang
	var thank = attrs.thank
	var thankAgain = attrs.thankAgain
	var signature = attrs.signature
	var files = attrs.files
	var comments = attrs.comments
	var subscription = attrs.subscription
	var flash = attrs.flash
	var events = attrs.events
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative
	var subscriberCount = attrs.subscriberCount

	var now = new Date
	var opt = signature ? "No" : "Yes"
	var optId = initiative.vote && Initiative.findOptionId(opt, initiative)
	var sentToParliamentAt = dbInitiative.sent_to_parliament_at

	var signWithIdCardText = !signature
		? t("BTN_VOTE_SIGN_WITH_ID_CARD")
		: t("BTN_VOTE_REVOKE_WITH_ID_CARD")

	var signWithMobileClass = signature ? "white-button" : "green-button"
	var signWithMobileText = !signature
		? t("BTN_VOTE_SIGN_WITH_MOBILE_ID")
		: t("BTN_VOTE_REVOKE_WITH_MOBILE_ID")

	var shareUrl = `${Config.url}/initiatives/${initiative.id}`
	var shareText = `${initiative.title} ${shareUrl}`
	var atomPath = req.baseUrl + req.url + ".atom"

	return <InitiativePage
		page="initiative"
		title={initiative.title}
		initiative={initiative}

		meta={{
			"og:title": initiative.title,
			"og:url": `${Config.url}/initiatives/${initiative.id}`
		}}

		links={[{
			rel: "alternate",
			type: "application/atom+xml",
			title: t("ATOM_INITIATIVE_FEED_TITLE", {title: initiative.title}),
			href: atomPath
		}]}

		req={req}>
		<script src="/assets/html5.js" />
		<script src="/assets/hwcrypto.js" />

    <PhasesView
      t={t}
      initiative={initiative}
      dbInitiative={dbInitiative}
    />

		<section id="initiative-section" class="transparent-section"><center>
			<div id="initiative-sheet" class="sheet">
				<Flash flash={flash} />

				{thank ? <div class="initiative-status">
          <h1 class="status-serif-header">{thankAgain
            ? t("THANKS_FOR_SIGNING_AGAIN")
            : t("THANKS_FOR_SIGNING")
          }</h1>

          <h2 class="status-subheader">{t("SUPPORT_US_TITLE")}</h2>
          {Jsx.html(I18n.markdown(lang, "donate"))}
					<DonateForm req={req} t={t} />

          <h2 class="status-subheader">
            {t("INITIATIVE_SIDEBAR_FOLLOW_HEADER")}
          </h2>

          <h3 class="status-subsubheader">
            {t("INITIATIVE_SIDEBAR_SUBSCRIBE")}
          </h3>

          <SubscribeEmailView
            req={req}
            initiative={initiative}
            count={subscriberCount}
            t={t}
          />
				</div> : null}

				{(function($value) {
					var sigs

					switch ($value) {
						case "inProgress":
							if (
								Initiative.isPublic(initiative) &&
								!Initiative.hasDiscussionEnded(new Date, initiative)
							) return <div class="initiative-status">
								<h1 class="status-header">
									{t("INITIATIVE_IN_DISCUSSION")}
									{" "}
									<a
										href="#initiative-comment-form"
										class="link-button wide-button">
										{t("ADD_YOUR_COMMENT")}
									</a>
									{"."}
								</h1>
							</div>
							else return null

						case "voting":
							if (Initiative.hasVoteEnded(now, initiative)) {
								sigs = Initiative.countSignatures("Yes", initiative)

								return <div class="initiative-status">
									{Initiative.isSuccessful(initiative, dbInitiative)? <Fragment>
                    <h1 class="status-header">
                      {t("N_SIGNATURES_COLLECTED", {votes: sigs})}
                    </h1>

										<p>{t("VOTING_SUCCEEDED")}</p>
									</Fragment> : <Fragment>
                    <h1 class="status-header">
                      {t("N_SIGNATURES_FAILED", {votes: sigs})}
                    </h1>

										<p>{t("VOTING_FAILED")}</p>
									</Fragment>}
								</div>
							}
							else return null

						case "followUp": return <div class="initiative-status">
							<h1 class="status-header">
								{t("INITIATIVE_IN_PARLIAMENT")}
								{" "}
								<a href="#initiative-events" class="link-button wide-button">
									{t("LOOK_AT_EVENTS")}
								</a>.
							</h1>
						</div>

						case "closed":
							if (
								Initiative.isInParliament(initiative, dbInitiative) ||
								sentToParliamentAt
							) return <div class="initiative-status">
									<h1 class="status-header">
										{t("INITIATIVE_PROCESSED")}
										{" "}
										<a
											href="#initiative-events"
											class="link-button wide-button">
											{t("LOOK_AT_EVENTS")}
										</a>.
									</h1>
								</div>
							else if (initiative.vote) {
								sigs = Initiative.countSignatures("Yes", initiative)

								return <div class="initiative-status">
                  <h1 class="status-header">
                    {t("N_SIGNATURES_FAILED", {votes: sigs})}
                  </h1>
									<p>{t("VOTING_FAILED")}</p>
								</div>
							}
							else return null

						default: return null
					}
				})(initiative.status)}

				<QuicksignView
					req={req}
					t={t}
					initiative={initiative}
					dbInitiative={dbInitiative}
					signature={signature}
				/>

				<InitiativeContentView
					initiative={initiative}
					dbInitiative={dbInitiative}
					files={files}
				/>

				{Initiative.isVotable(now, initiative) ? <div id="initiative-vote">
					<ProgressView
						t={t}
						initiative={initiative}
						dbInitiative={dbInitiative}
					/>

					<ProgressTextView
						initiative={initiative}
						dbInitiative={dbInitiative}
						t={t}
					/>

					{signature ? <Fragment>
						<h2>{t("THANKS_FOR_SIGNING")}</h2>
						<p>Soovid allkirja tühistada?</p>
					</Fragment> : <Fragment>
						<h2>{t("HEADING_CAST_YOUR_VOTE")}</h2>
						<p>{t("HEADING_VOTE_REQUIRE_HARD_ID")}</p>
					</Fragment>}

					<Form
						req={req}
						id="id-card-form"
						method="post"
						action={"/initiatives/" + (initiative.id) + "/signature"}>
						<input type="hidden" name="optionId" value={optId} />
						<input type="hidden" name="certificate" value="" />
						<input type="hidden" name="signature" value="" />
						<input type="hidden" name="token" value="" />
						<input type="hidden" name="method" value="id-card" />

						{
							// The Id-card form will be submitted async therefore no button
							// value.
						}
						<button class="inherited-button">
							<img
								src="/assets/id-kaart-button.png"
								title={signWithIdCardText}
								alt={signWithIdCardText}
							/>
						</button>
					</Form>

					<Form
						req={req}
						id="mobile-id-form"
						method="post"
						action={"/initiatives/" + (initiative.id) + "/signature"}>
						<input
							id="mobile-id-form-toggle"
							type="checkbox"
							style="display: none"
							onchange="this.form.phoneNumber.focus()"
						/>

						<label for="mobile-id-form-toggle" class="inherited-button">
							<img
								src="/assets/mobile-id-button.png"
								title={signWithMobileText}
								alt={signWithMobileText}
							/>
						</label>

						<input type="hidden" name="optionId" value={optId} />

						<input
							type="tel"
							name="phoneNumber"
							placeholder={t("PLACEHOLDER_PHONE_NUMBER")}
							required
							class="form-input"
						/>

						<input
							type="tel"
							name="pid"
							placeholder={t("PLACEHOLDER_PERSONAL_IDENTIFICATION_CODE")}
							required
							class="form-input"
						/>

						<button
							name="method"
							value="mobile-id"
							class={["button", signWithMobileClass].join(" ")}>
							{signWithMobileText}
						</button>
					</Form>

					{
						// This flash is for the the Id-card JavaScript code below.
					}
					<p id="initiative-vote-flash" class="flash error" />

					<script>{javascript`
						var Hwcrypto = require("@rahvaalgatus/hwcrypto")
						var TRANSLATIONS = ${stringify(UI_TRANSLATIONS[req.lang])}
						var form = document.getElementById("id-card-form")
						var flash = document.getElementById("initiative-vote-flash")
						var all = Promise.all.bind(Promise)

						form.addEventListener("submit", function(ev) {
							notice("")
							if (form.elements.signature.value === "") ev.preventDefault()

							var certificate = Hwcrypto.authenticate()

							var token = certificate.then(function(certificate) {
								var query = ""
								query += "certificate=" + encodeURIComponent(certificate)
								query += "&"
								query += "optionId=${optId}"
								return fetch("/initiatives/${initiative.id}/signable?" + query, {
									credentials: "same-origin"
								})
							})

							token = token.then(read).then(function(res) {
								if (!res.ok) throw res.json
								else return res.json
							})

							var sig = all([certificate, token]).then(function(all) {
								return Hwcrypto.sign(all[0], all[1].hash, all[1].digest)
							})

							var done = all([certificate, token, sig]).then(function(all) {
								form.elements.certificate.value = all[0]
								form.elements.token.value = all[1].token
								form.elements.signature.value = all[2]
								form.submit()
							})

							done.catch(noticeError)
							done.catch(raise)
						})

						function noticeError(err) {
							notice(err.code ? TRANSLATIONS[err.code] : err.message)
						}

						function read(res) {
							return res.json().then(function(v) { return res.json = v, res })
						}

						function notice(msg) { flash.textContent = msg }
						function raise(err) { setTimeout(function() { throw err }) }
					`}</script>
				</div> : null}
			</div>

			<aside id="initiative-sidebar">
				<div class="sidebar-section">
					<QuicksignView
						req={req}
						t={t}
						initiative={initiative}
						dbInitiative={dbInitiative}
						signature={signature}
					/>

					{Initiative.isPublic(initiative) ? <Fragment>
						<h3 class="sidebar-subheader">Tahad aidata? Jaga algatust…</h3>

						<a
							href={"https://facebook.com/sharer/sharer.php?u=" + encode(shareUrl)}
							target="_blank"
							class="grey-button ra-icon-facebook-logo share-button">
							{t("SHARE_ON_FACEBOOK")}
						</a>

						<a
							href={"https://twitter.com/intent/tweet?status=" + encode(shareText)}
							target="_blank"
							class="grey-button ra-icon-twitter-logo share-button">
							{t("SHARE_ON_TWITTER")}
						</a>
					</Fragment> : null}
				</div>

				<SidebarAuthorView
					req={req}
					initiative={initiative}
					dbInitiative={dbInitiative}
				/>

				<SidebarInfoView
					req={req}
					initiative={initiative}
					dbInitiative={dbInitiative}
				/>

				<SidebarSubscribeView
					req={req}
					initiative={initiative}
					subscriberCount={subscriberCount}
				/>

				<SidebarAdminView
					req={req}
					initiative={initiative}
				/>
			</aside>
		</center></section>

		<EventsView
			t={t}
			initiative={initiative}
			dbInitiative={dbInitiative}
			events={events}
		/>

		<CommentsView
			t={t}
			req={req}
			initiative={initiative}
			subscription={subscription}
			comments={comments}
		/>
	</InitiativePage>
}

function PhasesView(attrs) {
  var t = attrs.t
  var initiative = attrs.initiative
  var dbInitiative = attrs.dbInitiative
	var phase = dbInitiative.phase
  var vote = initiative.vote
	var createdAt = initiative.createdAt
  var acceptedByParliamentAt = dbInitiative.accepted_by_parliament_at
	var finishedInParliamentAt = dbInitiative.finished_in_parliament_at

	var receivedByParliamentAt = (
		dbInitiative.received_by_parliament_at ||
		dbInitiative.sent_to_parliament_at
	)

  var daysSinceCreated = diffInDays(new Date, createdAt)
  var daysInEdit = Initiative.daysInDiscussion(initiative)
  var discussionDaysLeft = daysInEdit - daysSinceCreated
  var sigs = vote ? Initiative.countSignatures("Yes", initiative) : 0

	var editProgress = isPhaseAfter("edit", phase)
		? 1
		: min(daysSinceCreated / daysInEdit, 1)

	var editPhaseText
	if (phase == "edit") {
		if (initiative.visibility == "private")
			editPhaseText = ""
		else if (!Initiative.hasDiscussionEnded(new Date, initiative))
			editPhaseText = t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {
				numberOfDaysLeft: discussionDaysLeft
			})
		else editPhaseText = t("DISCUSSION_FINISHED")
	}
	else if (dbInitiative.external)
		editPhaseText = ""
	else if (vote) editPhaseText =
		I18n.formatDateSpan("numeric", initiative.createdAt, vote.createdAt)

	var signProgress = isPhaseAfter("sign", phase)
		? 1
		: sigs / Config.votesRequired

  var signPhaseText

	if (isPhaseAtLeast("sign", phase)) {
		if (dbInitiative.external)
			signPhaseText = t("N_SIGNATURES_EXTERNAL")
		else if (dbInitiative.has_paper_signatures)
			signPhaseText = t("N_SIGNATURES_WITH_PAPER", {votes: sigs})
		else
			signPhaseText = t("N_SIGNATURES", {votes: sigs})
	}

	var parliamentProgress
  var parliamentPhaseText

	if (isPhaseAfter("parliament", phase) || finishedInParliamentAt) {
		parliamentProgress = 1

		parliamentPhaseText = finishedInParliamentAt ? I18n.formatDateSpan(
			"numeric",
			receivedByParliamentAt,
			finishedInParliamentAt
		) : ""
	}
	else if (phase != "parliament");
	else if (receivedByParliamentAt && !acceptedByParliamentAt) {
    var daysSinceSent = diffInDays(new Date, receivedByParliamentAt)
    let daysLeft = PARLIAMENT_ACCEPTANCE_DEADLINE_IN_DAYS - daysSinceSent
		parliamentProgress = daysSinceSent / PARLIAMENT_ACCEPTANCE_DEADLINE_IN_DAYS

		if (daysLeft > 0)
			parliamentPhaseText = t("PARLIAMENT_PHASE_ACCEPTANCE_N_DAYS_LEFT", {
				days: daysLeft
			})
    else if (daysLeft == 0)
      parliamentPhaseText = t("PARLIAMENT_PHASE_ACCEPTANCE_0_DAYS_LEFT")
    else
			parliamentPhaseText = t("PARLIAMENT_PHASE_ACCEPTANCE_N_DAYS_OVER", {
				days: Math.abs(daysLeft)
			})
  }
	else if (acceptedByParliamentAt) {
		var proceedingsDeadline = DateFns.addMonths(
			acceptedByParliamentAt,
			PARLIAMENT_PROCEEDINGS_DEADLINE_IN_MONTHS
		)

    var daysSinceAccepted = diffInDays(new Date, acceptedByParliamentAt)
		let daysLeft = diffInDays(proceedingsDeadline, new Date)
		var daysTotal = diffInDays(proceedingsDeadline, acceptedByParliamentAt)

		parliamentProgress = isPhaseAfter("parliament", phase)
			? 1
			: daysSinceAccepted / daysTotal

		if (daysLeft > 0)
			parliamentPhaseText = t("PARLIAMENT_PHASE_N_DAYS_LEFT", {days: daysLeft})
    else if (daysLeft == 0)
      parliamentPhaseText = t("PARLIAMENT_PHASE_0_DAYS_LEFT")
    else
			parliamentPhaseText = t("PARLIAMENT_PHASE_N_DAYS_OVER", {
				days: Math.abs(daysLeft)
			})
	}

	var governmentProgress = isPhaseAfter("government", phase) ? 1 : null

  return <section id="initiative-phases" class="transparent-section"><center>
    <ol>
			<li id="edit-phase" class={classifyPhase("edit", phase)}>
        <i>{t("EDIT_PHASE")}</i>
				<ProgressView value={editProgress} text={editPhaseText} />
      </li>

			<li id="sign-phase" class={classifyPhase("sign", phase)}>
        <i>{t("SIGN_PHASE")}</i>
				<ProgressView value={signProgress} text={signPhaseText} />
      </li>

			<li id="parliament-phase" class={classifyPhase("parliament", phase)}>
        <i>{t("PARLIAMENT_PHASE")}</i>
				<ProgressView value={parliamentProgress} text={parliamentPhaseText} />
      </li>

			<li id="government-phase" class={classifyPhase("government", phase)}>
        <i>{t("GOVERNMENT_PHASE")}</i>
				<ProgressView value={governmentProgress} />
      </li>

			{phase == "done" && dbInitiative.archived_at ? <li
				id="archived-phase"
				class="current">
        <i>{t("ARCHIVED_PHASE")}</i>
			</li> : <li
				id="done-phase"
				class={classifyPhase("done", phase)}>
        <i>{t("DONE_PHASE")}</i>
      </li>}
    </ol>
  </center></section>

	function ProgressView(attrs) {
		var value = attrs && attrs.value
		var text = attrs && attrs.text

		return <label class="progress">
			<progress value={value == null ? null : min(1, value)} />
			{text}
		</label>
	}

	function classifyPhase(phase, given) {
		var dist = PHASES.indexOf(given) - PHASES.indexOf(phase)
		return dist == 0 ? "current" : dist > 0 ? "past" : ""
	}
}

function InitiativeContentView(attrs) {
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative
	var initiativePath = "/initiatives/" + dbInitiative.uuid
	var files = attrs.files

	if (initiative.html)
		return <article class="text">{Jsx.html(initiative.html)}</article>
	
	if (dbInitiative.external) {
		var pdf = files.find((file) => file.content_type == "application/pdf")
		if (pdf == null) return null

		return <article class="pdf">
			<object
				data={initiativePath + "/files/" + pdf.id}
				type={pdf.content_type}
			/>
		</article>
	}

	return null
}

function SidebarAuthorView(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative

	var actions = <Fragment>
		{Initiative.canPublish(initiative) ? <FormButton
			req={req}
			action={"/initiatives/" + initiative.id}
			name="visibility"
			value="public"
			class="green-button wide-button">
			{t("PUBLISH_TOPIC")}
		</FormButton> : null}

		{Initiative.canPropose(new Date, initiative) ? <FormButton
			req={req}
			action={"/initiatives/" + initiative.id}
			name="status"
			value="voting"
			class="green-button wide-button">
			{t("BTN_SEND_TO_VOTE")}
		</FormButton> : null}

		{Initiative.canSendToParliament(initiative, dbInitiative) ?
			<FormButton
				req={req}
				action={"/initiatives/" + initiative.id}
				name="status"
				value="followUp"
				class="green-button wide-button">
				{t("SEND_TO_PARLIAMENT")}
			</FormButton>
		: null}

		{Initiative.canEditBody(initiative) ? <a
			href={"/initiatives/" + initiative.id + "/edit"}
			class="link-button wide-button">
			{t("EDIT_INITIATIVE_TEXT")}
		</a> : null}

		{Initiative.canUpdateDiscussionDeadline(initiative) ? <FormButton
			req={req}
			action={"/initiatives/" + initiative.id}
			name="visibility"
			value="public"
			class="link-button wide-button">
			{t("RENEW_DEADLINE")}
		</FormButton> : null}

		{Initiative.canUpdateVoteDeadline(initiative) ? <FormButton
			req={req}
			action={"/initiatives/" + initiative.id}
			name="status"
			value="voting"
			class="link-button wide-button">
			{t("RENEW_DEADLINE")}
		</FormButton> : null}

		{Initiative.canInvite(initiative) ? <a
			href={"/initiatives/" + initiative.id + "/authors/new"}
			class="link-button wide-button">
			{t("INVITE_PEOPLE")}
		</a> : null}

		{Initiative.canDelete(initiative) ? <FormButton
			req={req}
			action={"/initiatives/" + initiative.id}
			name="_method"
			value="delete"
			onclick={confirm(t("TXT_ALL_DISCUSSIONS_AND_VOTES_DELETED"))}
			class="link-button wide-button">
			{t("DELETE_DISCUSSION")}
		</FormButton> : null}
	</Fragment>

	if (!actions.some(Boolean)) return null

	return <div id="initiative-author-options" class="sidebar-section">
		<h2 class="sidebar-header">Algatajale</h2>
		{actions}
	</div>
}

function SidebarInfoView(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative
	var canEdit = Initiative.canEdit(initiative)
	var phase = dbInitiative.phase
	var authorUrl = dbInitiative.author_url
	var communityUrl = dbInitiative.community_url
	var externalUrl = dbInitiative.url
	var organizations = dbInitiative.organizations
	var mediaUrls = dbInitiative.media_urls
	var meetings = dbInitiative.meetings
	var notes = dbInitiative.notes
	var governmentChangeUrls = dbInitiative.government_change_urls
	var publicChangeUrls = dbInitiative.public_change_urls

	if (!(
		canEdit ||
		authorUrl ||
		communityUrl ||
		organizations.length > 0 ||
		meetings.length > 0 ||
		mediaUrls.length > 0 ||
		externalUrl ||
		notes > 0
	)) return null

	return <Form
		req={req}
		id="initiative-info"
		class="sidebar-section"
		method="put"
		action={"/initiatives/" + initiative.id}>
		<input type="checkbox" id="initiative-info-form-toggle" hidden />

		<h2 class="sidebar-header">
			{canEdit ? <label
				class="edit-button link-button"
				for="initiative-info-form-toggle">
				{t("EDIT_INITIATIVE_INFO")}
			</label> : null}

			Lisainfo
		</h2>

		{authorUrl || canEdit ? <InitiativeAttribute
			t={t}
			editable={canEdit}
			title="Algatajast"
			help="Ametliku veebilehe asemel sobib viidata ka lehele sotsiaalmeedias."
			name="author_url"
			type="url"
			placeholder="https://"
			value={authorUrl}
		>
			<UntrustedLink class="form-output" href={authorUrl} />
		</InitiativeAttribute> : null}

		{communityUrl || canEdit ? <InitiativeAttribute
			t={t}
			editable={canEdit}
			title="Virtuaalse arutelu kese"
			help="Sotsiaalmeedia gruppide asemel võib lisada ka teemaviite (#hashtag-i)."
			name="community_url"
			placeholder="https://"
			value={communityUrl}
		>
			<UntrustedLink class="form-output" href={communityUrl} />
		</InitiativeAttribute> : null}

		{organizations.length > 0 || canEdit ? <Fragment>
			<h3 class="sidebar-subheader">Liitunud ühendused</h3>

			{organizations.length > 0 ? <ul class="form-output">
				{organizations.map((organization) => <li>
					<UntrustedLink href={organization.url}>
						{organization.name}
					</UntrustedLink>
				</li>)}
			</ul> : <AddInitiativeInfoButton t={t} />}

			{canEdit ? <InitiativeAttributeList
				id="initiative-organizations-form"
				add="Lisa ühendus"
				help="Sisesta ühenduse nimi ja viide."
				values={organizations}
				default={EMPTY_ORG}
			>{(organization, i) => <li>
				<input
					class="form-input"
					placeholder="Ühenduse nimi"
					name={`organizations[${i}][name]`}
					value={organization.name}
				/>

				<input
					class="form-input"
					type="url"
					name={`organizations[${i}][url]`}
					value={organization.url}
					placeholder="https://"
				/>
			</li>}</InitiativeAttributeList>: null}
		</Fragment> : null}

		{meetings.length > 0 || canEdit ? <Fragment>
			<h3 class="sidebar-subheader">Avalikud arutelud</h3>

			{meetings.length > 0 ? <ul class="form-output">
				{meetings.map((meeting) => <li>
					<UntrustedLink href={meeting.url}>
						{I18n.formatDate("numeric", Time.parseDate(meeting.date))}
					</UntrustedLink>
				</li>)}
			</ul> : <AddInitiativeInfoButton t={t} />}

			{canEdit ? <InitiativeAttributeList
				id="initiative-meetings-form"
				add="Lisa arutelu"
				help="Sisesta toimumiskuupäev ja viide."
				values={meetings}
				default={EMPTY_ORG}
			>{(meeting, i) => <li>
				<input
					class="form-input"
					type="date"
					placeholder="Kuupäev"
					name={`meetings[${i}][date]`}
					value={meeting.date}
				/>

				<input
					class="form-input"
					type="url"
					name={`meetings[${i}][url]`}
					value={meeting.url}
					placeholder="https://"
				/>
			</li>}</InitiativeAttributeList>: null}
		</Fragment> : null}

		{isPhaseAtLeast("sign", phase) ? <Fragment>
			{externalUrl || canEdit ? <InitiativeAttribute
				t={t}
				editable={canEdit}
				title="Kampaanialeht"
				name="url"
				type="url"
				placeholder="https://"
				value={externalUrl}
			>
				<UntrustedLink class="form-output" href={externalUrl} />
			</InitiativeAttribute> : null}
		</Fragment> : null}

		{isPhaseAtLeast("parliament", phase) ? <Fragment>
			{mediaUrls.length > 0 || canEdit ? <Fragment>
				<h3 class="sidebar-subheader">Menetluse meediakajastus</h3>

				{mediaUrls.length > 0 ? <ul class="form-output">
					{mediaUrls.map((url) => <li>
						<UntrustedLink href={url}>{url}</UntrustedLink>
					</li>)}
				</ul> : <AddInitiativeInfoButton t={t} />}

				{canEdit ? <InitiativeAttributeList
					id="initiative-media-urls-form"
					add="Lisa viide"
					values={mediaUrls}
				>{(url, i) => <li>
					<input
						class="form-input"
						type="url"
						name={`media_urls[${i}]`}
						value={url}
						placeholder="https://"
					/>
				</li>}</InitiativeAttributeList>: null}
			</Fragment> : null}
		</Fragment> : null}

		{isPhaseAtLeast("government", phase) ? <Fragment>
			{mediaUrls.length > 0 || canEdit ? <Fragment>
				<h3 class="sidebar-subheader">Arengut suunavad kokkulepped</h3>

				{governmentChangeUrls.length > 0 ? <ul class="form-output">
					{governmentChangeUrls.map((url) => <li>
						<UntrustedLink href={url}>{url}</UntrustedLink>
					</li>)}
				</ul> : <AddInitiativeInfoButton t={t} />}

				{canEdit ? <InitiativeAttributeList
					id="initiative-government-change-urls-form"
					add="Lisa viide"
					help="Ühiskondliku toetuse leidnud ettepanekud võivad jõuda ka eelarvestrateegiasse, koalitsioonileppesse või arengukavasse."
					values={governmentChangeUrls}
				>{(url, i) => <li>
					<input
						class="form-input"
						type="url"
						name={`government_change_urls[${i}]`}
						value={url}
						placeholder="https://"
					/>
				</li>}</InitiativeAttributeList>: null}
			</Fragment> : null}
		</Fragment> : null}

		{isPhaseAtLeast("done", phase) ? <Fragment>
			{mediaUrls.length > 0 || canEdit ? <Fragment>
				<h3 class="sidebar-subheader">Otsused ja muutused</h3>

				{publicChangeUrls.length > 0 ? <ul class="form-output">
					{publicChangeUrls.map((url) => <li>
						<UntrustedLink href={url}>{url}</UntrustedLink>
					</li>)}
				</ul> : <AddInitiativeInfoButton t={t} />}

				{canEdit ? <InitiativeAttributeList
					id="initiative-public-change-urls-form"
					add="Lisa viide"
					help="Viited arengut suunavatele dokumentidele, vahearuannetele ja teadustöödele."
					values={publicChangeUrls}
				>{(url, i) => <li>
					<input
						class="form-input"
						type="url"
						name={`public_change_urls[${i}]`}
						value={url}
						placeholder="https://"
					/>
				</li>}</InitiativeAttributeList>: null}
			</Fragment> : null}
		</Fragment> : null}

		{dbInitiative.notes || canEdit ? <InitiativeAttribute
			t={t}
			editable={canEdit}
			type="textarea"
			title={t("NOTES_HEADER")}
			name="notes"
			value={dbInitiative.notes}
		>
			<p class="text form-output">{Jsx.html(linkify(dbInitiative.notes))}</p>
		</InitiativeAttribute> : null}

		<div class="form-buttons">
			<button type="submit" class="green-button">
				{t("UPDATE_INITIATIVE_INFO")}
			</button>

			<span class="form-or">{t("FORM_OR")}</span>

			<label class="link-button" for="initiative-info-form-toggle">
				{t("CANCEL_INITIATIVE_INFO")}
			</label>
		</div>
	</Form>
}

function SidebarSubscribeView(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var subscriberCount = attrs.subscriberCount
	var atomPath = req.baseUrl + req.url + ".atom"

	return <div class="sidebar-section">
		<h2 class="sidebar-header">{t("INITIATIVE_SIDEBAR_FOLLOW_HEADER")}</h2>

		<h3 class="sidebar-subheader">{t("INITIATIVE_SIDEBAR_SUBSCRIBE")}</h3>

		<SubscribeEmailView
			req={req}
			initiative={initiative}
			count={subscriberCount}
			t={t}
		/>

		<h3 class="sidebar-subheader">{t("SUBSCRIBE_VIA_ATOM_HEADER")}</h3>

		<a href={atomPath} class="grey-button ra-icon-rss">
			{t("SUBSCRIBE_VIA_ATOM_BUTTON")}
		</a>
	</div>
}

function SidebarAdminView(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative

	var isAdmin = req.user && _.contains(Config.adminUserIds, req.user.id)
	if (!isAdmin) return null

	return <div class="sidebar-section">
		<h2 class="sidebar-header">Administraatorile</h2>
		<a
			href={`${Config.adminUrl}/initiatives/${initiative.id}`}
			class="link-button wide-button">
			Administreeri algatust
		</a>
	</div>
}

function EventsView(attrs) {
	var t = attrs.t
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative
	var events = attrs.events
	var initiativePath = "/initiatives/" + dbInitiative.uuid

	if (events.length > 0 || Initiative.canCreateEvents(initiative))
		return <section id="initiative-events" class="transparent-section"><center>
			<article class="sheet">
				{Initiative.canCreateEvents(initiative) ? <a
					href={`/initiatives/${initiative.id}/events/new`}
					class="create-event-button">
					{t("CREATE_INITIATIVE_EVENT_BUTTON")}
				</a> : null}

        <ol class="events">{events.map(function(event) {
					var title
					var content
					var summary
					var klass = `event ${event.type}-event`
					var phase = initiativePhaseFromEvent(event)
					if (phase) klass += ` ${phase}-phase`

					switch (event.type) {
						case "sent-to-parliament":
							title = t("INITIATIVE_SENT_TO_PARLIAMENT_TITLE")

							content = <p class="text">
								{t("INITIATIVE_SENT_TO_PARLIAMENT_BODY")}
							</p>
							break

						case "parliament-received":
							title = t("PARLIAMENT_RECEIVED")
							break

						case "parliament-accepted":
							title = t("PARLIAMENT_ACCEPTED")
							break

						case "parliament-committee-meeting":
							var meeting = event.content

							title = meeting.committee
								? t("PARLIAMENT_COMMITTEE_MEETING_BY", {
									committee: meeting.committee
								})
								: t("PARLIAMENT_COMMITTEE_MEETING")

							var decision = {
								continue: t("PARLIAMENT_MEETING_DECISION_CONTINUE"),
								reject: t("PARLIAMENT_MEETING_DECISION_REJECT"),
								forward: t("PARLIAMENT_MEETING_DECISION_FORWARD"),

								"solve-differently": t(
									"PARLIAMENT_MEETING_DECISION_SOLVE_DIFFERENTLY"
								)
							}[meeting.decision]

							content = <Fragment>
								{meeting.summary ? <p class="text">
										{Jsx.html(linkify(meeting.summary))}
								</p> : null}

								{decision ? <p class="text">{decision}</p> : null}

								{meeting.invitees ? <p class="text">
									{Jsx.html(t("PARLIAMENT_MEETING_INVITEES", {
										invitees: _.escapeHtml(meeting.invitees)
									}))}
								</p> : null}
							</Fragment>
							break

						case "parliament-letter":
							var letter = event.content
							summary = event.content.summary

							title = letter.direction == "incoming"
								? t("PARLIAMENT_LETTER_INCOMING")
								: t("PARLIAMENT_LETTER_OUTGOING")

							content = <Fragment>
								<table class="letterhead">
									<tr>
										<th scope="row">{t("PARLIAMENT_LETTER_TITLE")}</th>
										<td>{letter.title}</td>
									</tr>
									{letter.direction == "incoming" ? <tr>
										<th scope="row">{t("PARLIAMENT_LETTER_FROM")}</th>
										<td><ul>{letter.from.split(",").map((from) => (
											<li>{from}</li>
										))}</ul></td>
									</tr> : <tr>
										<th scope="row">{t("PARLIAMENT_LETTER_TO")}</th>
										<td><ul>{letter.to.split(",").map((to) => (
											<li>{to}</li>
										))}</ul></td>
									</tr>}
								</table>

								{summary && <p class="text">{Jsx.html(linkify(summary))}</p>}
							</Fragment>
							break

						case "parliament-decision":
							title = t("PARLIAMENT_DECISION")

							summary = event.content.summary
							if (summary)
								content = <p class="text">{Jsx.html(linkify(summary))}</p>
							break

						case "parliament-finished":
							title = t("PARLIAMENT_FINISHED")
							break

						case "signature-milestone":
							title = t("SIGNATURE_MILESTONE_EVENT_TITLE", {
								milestone: event.content
							})
							break

						case "text":
							title = event.title
							content = <p class="text">{Jsx.html(linkify(event.content))}</p>
							break

						default:
							throw new RangeError("Unsupported event type: " + event.type)
					}

					var files = event.files || EMPTY_ARR

          // No point in showing delay warnings for events that were created
          // before we started notifying people of new events.
          var delay = +event.created_at >= +EVENT_NOTIFICATIONS_SINCE
						? diffInDays(event.occurred_at, event.created_at)
						: 0

					return <li id={"event-" + event.id} class={klass}>
						<h2>{title}</h2>

						<time class="occurred-at" datetime={event.occurred_at.toJSON()}>
							{I18n.formatDate("numeric", event.occurred_at)}
						</time>

						{content}

						{files.length > 0 ? <ul class="files">{files.map(function(file) {
							var type = file.content_type.name
							var title = file.title || file.name
							var filePath =`${initiativePath}/files/${file.id}`
							var icon = FILE_TYPE_ICONS[type] || "unknown"

							return <li class="file">
								<a href={filePath} tabindex="-1" class={"icon " + icon} />
								<a class="name" title={title} href={filePath}>{title}</a>

								<small class="type">{FILE_TYPE_NAMES[type] || type}</small>
								{", "}
								<small class="size">{I18n.formatBytes(file.size)}</small>
								{". "}

								{file.url ? <small><a class="external" href={file.url}>
									Riigikogu dokumendiregistris.
								</a></small> : null}
							</li>
						})}</ul> : null}

            {event.type == "text" && delay != 0 ? <p class="delay">
              {Jsx.html(t("EVENT_NOTIFICATIONS_DELAYED", {
                isotime: event.created_at.toJSON(),
                date: I18n.formatDate("numeric", event.created_at)
              }))}
            </p> : null}
					</li>
				})}</ol>
			</article>
		</center></section>

	else if (Initiative.isInParliament(initiative, dbInitiative))
		return <section id="initiative-events" class="transparent-section"><center>
			<article><p class="text empty">{t("NO_GOVERNMENT_REPLY")}</p></article>
		</center></section>

	else return null
}

function CommentsView(attrs) {
	var t = attrs.t
	var req = attrs.req
	var initiative = attrs.initiative
	var comments = attrs.comments
	var subscription = attrs.subscription

	return <section id="initiative-comments" class="transparent-section"><center>
		<h2>{t("COMMENT_HEADING")}</h2>

		<ol class="comments">
			{comments.map((comment) => <li
				id={`comment-${comment.id}`}
				class="comment">
				<CommentView req={req} initiative={initiative} comment={comment} />
			</li>)}
		</ol>

		<CommentForm
			req={req}
			initiative={initiative}
			subscription={subscription}
			referrer={req.baseUrl + req.path}
		/>
	</center></section>
}

function SubscribeEmailView(attrs) {
	var t = attrs.t
	var req = attrs.req
	var initiative = attrs.initiative
	var count = attrs.count

	if (!Initiative.isPublic(initiative)) return null

	return <Form
		req={req}
		class="initiative-subscribe-form"
		method="post"
		action={"/initiatives/" + initiative.id + "/subscriptions"}>
    <input
      id="initiative-subscribe-email"
      name="email"
      type="email"
      required
      placeholder={t("LBL_EMAIL")}
      class="form-input"
    />

    <button type="submit" class="secondary-button">{t("BTN_SUBSCRIBE")}</button>
		<p>{Jsx.html(t("INITIATIVE_SUBSCRIBER_COUNT", {count: count}))}</p>
	</Form>
}

function ProgressTextView(attrs) {
	var t = attrs.t
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative

	if (
		initiative.status == "voting" ||
		initiative.status == "closed" &&
		initiative.vote && !Initiative.isInParliament(initiative, dbInitiative)
	) {
		var sigs = Initiative.countSignatures("Yes", initiative)
		var missing = Config.votesRequired - sigs

		return <p class="initiative-progress-text">
			<span>
				{sigs >= Config.votesRequired
					? Jsx.html(t("SIGNATURES_COLLECTED"))
					: Jsx.html(t("MISSING_N_SIGNATURES", {signatures: missing}))
				}
			</span>
			{" "}
			<span>
				{t("VOTING_DEADLINE")}
				{": "}
				<time datetime={initiative.vote.endsAt} class="deadline">
					{I18n.formatDateTime("numeric", initiative.vote.endsAt)}
				</time>.
			</span>
		</p>
	}
	else if (initiative.status == "inProgress")
		return <p class="initiative-progress-text">
			<span>
				{t("DISCUSSION_DEADLINE")}
				{": "}
				<time datetime={initiative.endsAt}>
					{I18n.formatDateTime("numeric", initiative.endsAt)}
				</time>
			</span>
		</p>

	else return null
}

function QuicksignView(attrs) {
	var t = attrs.t
	var req = attrs.req
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative
	var signature = attrs.signature
	if (!Initiative.isPublic(initiative)) return null

	// There may be multiple QuicksignViews on the page.
	var id = _.uniqueId("initiative-quicksign-")
	var now = new Date

	return <div class="quicksign">
		<ProgressView t={t} initiative={initiative} dbInitiative={dbInitiative} />

		{Initiative.isVotable(now, initiative) && !signature ? <a
			href="#initiative-vote"
			class="green-button wide-button sign-button">
			{t("SIGN_THIS_DOCUMENT")}
			</a>
		: null}

		<ProgressTextView
			initiative={initiative}
			dbInitiative={dbInitiative}
			t={t}
		/>

		{Initiative.isVotable(now, initiative) && signature ? <Fragment>
			<h2>{t("THANKS_FOR_SIGNING")}</h2>

			<a href="#initiative-vote" class="link-button revoke-button">
				{t("REVOKE_SIGNATURE")}
			</a>

			{signature.user_uuid ? <Fragment>
				{" "}või vaid <FormButton
					req={req}
					class="link-button hide-button"
					action={"/initiatives/" + initiative.id + "/signature"}
					onclick={confirm(t("HIDE_SIGNATURE_CONFIRMATION"))}
					name="hidden"
					value="true">
					peida kontolt
				</FormButton>.{" "}

				<input
					type="checkbox"
					class="hiding-description-toggle"
					id={"hiding-description-toggle-" + id}
					hidden
				/>

				<label
					class="link-button"
					for={"hiding-description-toggle-" + id}>
					(?)
				</label>

				<p class="hiding-description">{t("HIDE_SIGNATURE_DESCRIPTION")}</p>
			</Fragment> : "."}
		</Fragment> : null}
	</div>
}

function InitiativeAttribute(attrs, children) {
	var t = attrs.t
	var title = attrs.title
	var type = attrs.type
	var name = attrs.name
	var value = attrs.value
	var placeholder = attrs.placeholder
	var help = attrs.help
	var editable = attrs.editable

	return <Fragment>
		<h3 class="sidebar-subheader">{title}</h3>
		{value ? children : <AddInitiativeInfoButton t={t} /> }

		{editable ? <div class="form-fields">
			{type == "textarea" ? <textarea
				name={name}
				class="form-textarea"
				placeholder={placeholder}>
				{value}
			</textarea> : <input
				name={name}
				type={type}
				class="form-input"
				placeholder={placeholder}
				value={value}
			/>}

			{help ? <p>{help}</p> : null}
		</div> : null}
	</Fragment>
}

function InitiativeAttributeList(attrs, children) {
	var id = attrs.id
	var values = attrs.values
	var def = attrs.default
	var add = attrs.add
	var help = attrs.help
	var render = children[0]
	var buttonId = _.uniqueId("initiative-attributes-")

	return <div id={id} class="form-fields">
		{help ? <p>{help}</p> : null}

		<ol class="form-list">
			{(values.length > 0 ? values : [def]).map(render)}
		</ol>

		<button type="button" id={buttonId}>{add}</button>

		<script>{javascript`
			var button = document.getElementById("${buttonId}")
			var list = button.previousSibling
			var each = Function.call.bind(Array.prototype.forEach)

			button.addEventListener("click", function(ev) {
				var el = list.lastChild.cloneNode(true)
				list.appendChild(el)
				var inputs = el.getElementsByTagName("input")

				each(inputs, function(input) {
					input.name = incrementName(input.name)
					input.value = ""
				})

				inputs[0].focus()
			})

			function incrementName(name) {
				return name.replace(/\\[(\\d+)\\]/g, function(_all, n) {
					return "[" + (+n + 1) + "]"
				})
			}
		`}</script>
	</div>
}

function UntrustedLink(attrs, children) {
	var href = attrs.href
	var klass = attrs.class || ""

	if (HTTP_URL.test(href)) return <a {...attrs} class={klass + " link-button"}>
		{children || href}
	</a>
	else return <span class={klass}>{children || href}</span>
}

function AddInitiativeInfoButton(attrs) {
	var t = attrs.t

	return <label
		class="edit-button link-button"
		for="initiative-info-form-toggle">
		{t("ADD_INITIATIVE_INFO")}
	</label>
}

function isPhaseAtLeast(than, phase) {
	return PHASES.indexOf(phase) >= PHASES.indexOf(than)
}

function isPhaseAfter(than, phase) {
	return PHASES.indexOf(phase) > PHASES.indexOf(than)
}

function initiativePhaseFromEvent(event) {
	switch (event.type) {
		case "signature-milestone": return "sign"
		case "sent-to-parliament":
		case "parliament-received":
		case "parliament-accepted":
		case "parliament-letter":
		case "parliament-decision":
		case "parliament-finished":
		case "parliament-committee-meeting": return "parliament"
		case "text": return null
		default: throw new RangeError("Unsupported event type: " + event.type)
	}
}

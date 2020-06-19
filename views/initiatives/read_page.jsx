/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Url = require("url")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Time = require("root/lib/time")
var DateFns = require("date-fns")
var InitiativePage = require("./initiative_page")
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var Flash = require("../page").Flash
var Form = require("../page").Form
var Trix = require("root/lib/trix")
var Initiative = require("root/lib/initiative")
var FormButton = require("../page").FormButton
var DonateForm = require("../donations/create_page").DonateForm
var CommentView = require("./comments/read_page").CommentView
var CommentForm = require("./comments/create_page").CommentForm
var ProgressView = require("./initiative_page").ProgressView
var {getRequiredSignatureCount} = require("root/lib/initiative")
var {isAdmin} = require("root/lib/user")
var javascript = require("root/lib/jsx").javascript
var serializeInitiativeUrl = require("root/lib/initiative").initiativeUrl
var serializeImageUrl = require("root/lib/initiative").imageUrl
var {pathToSignature} =
	require("root/controllers/initiatives/signatures_controller")
var confirm = require("root/lib/jsx").confirm
var stringify = require("root/lib/json").stringify
var linkify = require("root/lib/linkify")
var encode = encodeURIComponent
var min = Math.min
var {normalizeCitizenOsHtml} = require("root/lib/initiative")
var diffInDays = DateFns.differenceInCalendarDays
var PHASES = require("root/lib/initiative").PHASES
var HTTP_URL = /^https?:\/\//i
var EMPTY_ARR = Array.prototype
var EMPTY_ORG = {name: "", url: ""}
var EVENT_NOTIFICATIONS_SINCE = new Date(Config.eventNotificationsSince)
var SIGNABLE_TYPE = "application/vnd.rahvaalgatus.signable"
var ERR_TYPE = "application/vnd.rahvaalgatus.error+json"
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
exports = module.exports = ReadPage
exports.InitiativeDestinationSelectView = InitiativeDestinationSelectView
exports.SigningView = SigningView

var LOCAL_GOVERNMENTS_BY_COUNTY = _.mapValues(_.groupBy(
	_.toEntries(LOCAL_GOVERNMENTS),
	([_id, gov]) => gov.county
), (govs) => _.sortBy(govs, ([_id, gov]) => gov.name).map(([id, gov]) => [
	id,
	gov.name
]))

// Kollektiivse pöördumise (edaspidi käesolevas peatükis pöördumine) menetlusse
// võtmise otsustab Riigikogu juhatus 30 kalendripäeva jooksul kollektiivse
// pöördumise esitamisest arvates.
//
// https://www.riigiteataja.ee/akt/122122014013?leiaKehtiv#para152b9
var PARLIAMENT_ACCEPTANCE_DEADLINE_IN_DAYS = 30

// Komisjon arutab pöördumist kolme kuu jooksul ning teeb otsuse pöördumise
// kohta kuue kuu jooksul pöördumise menetlusse võtmisest arvates.
//
// https://www.riigiteataja.ee/akt/122122014013?leiaKehtiv#para152b12
var PARLIAMENT_PROCEEDINGS_DEADLINE_IN_MONTHS = 6

var UI_TRANSLATIONS = _.mapValues(I18n.STRINGS, function(lang) {
	return _.filterValues(lang, (_value, key) => key.indexOf("HWCRYPTO") >= 0)
})

var FILE_TYPE_ICONS = {
	"text/html": "ra-icon-html",
	"application/pdf": "ra-icon-pdf",
	"image/jpeg": "ra-icon-jpeg",
	"application/vnd.ms-powerpoint": "ra-icon-ppt",
	"application/vnd.ms-outlook": "ra-icon-msg",
	"application/vnd.etsi.asic-e+zip": "ra-icon-ddoc",
	"application/digidoc": "ra-icon-ddoc",
	"application/msword": "ra-icon-doc",

	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		"ra-icon-doc",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		"ra-icon-ppt"
}

var FILE_TYPE_NAMES = {
	"text/plain": "Text",
	"text/html": "HTML",
	"application/pdf": "PDF",
	"image/jpeg": "JPEG",
	"application/vnd.etsi.asic-e+zip": "Digidoc",
	"application/vnd.ms-powerpoint": "Microsoft PowerPoint",
	"application/vnd.ms-outlook": "Microsoft Outlook Email",
	"application/msword": "Microsoft Word",

	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		"Microsoft Word",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		"Microsoft PowerPoint",

	// https://api.riigikogu.ee/api/files/800ed589-3d0b-4048-9b70-2ff6b0684ed4
	// has its type as "application/digidoc. I've not yet found whether that has
	// ever been a valid MIME type.
	"application/digidoc": "Digidoc"
}

function ReadPage(attrs) {
	var req = attrs.req
	var t = attrs.t
	var user = req.user
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
	var initiativePath = "/initiatives/" + initiative.uuid
	var subscriberCounts = attrs.subscriberCounts
	var signatureCount = attrs.signatureCount
	var text = attrs.text
	var image = attrs.image
	var initiativeUrl = serializeInitiativeUrl(initiative)
	var shareText = `${initiative.title} ${initiativeUrl}`
	var atomPath = req.baseUrl + req.url + ".atom"

	var imageEditable = (
		user && initiative.user_id == user.id &&
		initiative.phase != "done" &&
		!initiative.archived_at
	)

	return <InitiativePage
		page="initiative"
		title={initiative.title}
		initiative={initiative}

		meta={_.filterValues({
			"twitter:card": "summary_large_image",
			"og:title": initiative.title,
			"og:url": initiativeUrl,
			"og:image": image && serializeImageUrl(initiative, image)
		}, Boolean)}

		links={[{
			rel: "alternate",
			type: "application/atom+xml",
			title: t("ATOM_INITIATIVE_FEED_TITLE", {title: initiative.title}),
			href: atomPath
		}]}

		req={req}>
		<script src="/assets/html5.js" />
		<script src="/assets/hwcrypto.js" />

		{initiative.destination == "parliament" ? <PhasesView
      t={t}
      initiative={initiative}
			signatureCount={signatureCount}
    /> : null}

		<section class="initiative-section transparent-section"><center>
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

					{initiative.published_at ?
						<SubscribeEmailView
							req={req}
							initiative={initiative}
							count={subscriberCounts.initiative}
							allCount={subscriberCounts.all}
							t={t}
						/>
					: null}
				</div> : null}

				{function(phase) {
					switch (phase) {
						case "edit":
							if (
								initiative.published_at &&
								new Date < initiative.discussion_ends_at
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

						case "sign":
							var signatureThreshold = getRequiredSignatureCount(initiative)

							if (initiative.signing_ends_at <= new Date) {
								return <div class="initiative-status">
									{signatureCount >= signatureThreshold ? <Fragment>
                    <h1 class="status-header">
                      {t("N_SIGNATURES_COLLECTED", {votes: signatureCount})}
                    </h1>

										<p>{t("VOTING_SUCCEEDED")}</p>
									</Fragment> : <Fragment>
                    <h1 class="status-header">
                      {t("N_SIGNATURES_FAILED", {votes: signatureCount})}
                    </h1>

										<p>{t("VOTING_FAILED")}</p>
									</Fragment>}
								</div>
							}
							else return null

						case "parliament": return <div class="initiative-status">
							<h1 class="status-header">
								{t("INITIATIVE_IN_PARLIAMENT")}
								{" "}
								<a href="#initiative-events" class="link-button wide-button">
									{t("LOOK_AT_EVENTS")}
								</a>.
							</h1>
						</div>

						case "government": return <div class="initiative-status">
							<h1 class="status-header">
								{t("INITIATIVE_IN_GOVERNMENT")}
								{" "}
								<a href="#initiative-events" class="link-button wide-button">
									{t("LOOK_AT_EVENTS")}
								</a>.
							</h1>
						</div>

						case "done":
							return <div class="initiative-status">
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

						default: throw new RangeError("Invalid phase: " + initiative.phase)
					}
				}(initiative.phase)}

				<QuicksignView
					req={req}
					t={t}
					initiative={initiative}
					signature={signature}
					signatureCount={signatureCount}
				/>

				<InitiativeContentView
					initiative={initiative}
					text={text}
					files={files}
				/>

				{isSignable(initiative) ? <div id="initiative-vote">
					<ProgressView
						t={t}
						initiative={initiative}
						signatureCount={signatureCount}
					/>

					<ProgressTextView
						t={t}
						initiative={initiative}
						signatureCount={signatureCount}
					/>

					{signature ? <Fragment>
						<h2>{t("THANKS_FOR_SIGNING")}</h2>
						<p>Soovid allkirja tühistada?</p>
					</Fragment> : <Fragment>
						<h2>{t("HEADING_CAST_YOUR_VOTE")}</h2>
						<p>{t("HEADING_VOTE_REQUIRE_HARD_ID")}</p>
					</Fragment>}

					{signature ? <DeleteSignatureButton req={req} signature={signature}>
						{t("REVOKE_SIGNATURE")}
					</DeleteSignatureButton> : <SigningView
						req={req}
						t={t}
						action={initiativePath + "/signatures"}
					/>}
				</div> : null}
			</div>

			<aside id="initiative-sidebar">
				<div class="sidebar-section">
					<QuicksignView
						req={req}
						t={t}
						initiative={initiative}
						signature={signature}
						signatureCount={signatureCount}
					/>

					<InitiativeLocationView t={t} initiative={initiative} />

					{image ? <figure
						id="initiative-image"
						class={imageEditable ? "editable" : ""}
					>
						<img src={serializeImageUrl(initiative, image)} />

						{(
							image.author_name ||
							image.author_url ||
							imageEditable
						) ? <figcaption
							class={image.author_name || image.author_url ? "" : "empty"}
						>
							{image.author_name || image.author_url ? <Fragment>
								{t("INITIATIVE_IMAGE_AUTHOR_IS")}: {renderImageAuthor(image)}
							</Fragment> : Jsx.html(t("INITIATIVE_IMAGE_AUTHOR_EMPTY"))}
						</figcaption> : null}

						{imageEditable ? <input
							type="checkbox"
							id="initiative-image-author-toggle"
							hidden
						/> : null}

						{imageEditable ? <menu>
							<input
								type="checkbox"
								id="initiative-image-author-toggle"
								hidden
							/>

							{image.author_name || image.author_url ? <Fragment>
								<label
									class="link-button"
									for="initiative-image-author-toggle">
									{t("INITIATIVE_IMAGE_AUTHOR_EDIT")}
								</label>
								{", "}
							</Fragment> : null}

							<InitiativeImageUploadForm
								req={req}
								initiative={initiative}
								class="link-button">
								{t("INITIATIVE_IMAGE_REPLACE_IMAGE")}
							</InitiativeImageUploadForm>

							<span class="form-or">{t("FORM_OR")}</span>

							<FormButton
								req={req}
								action={initiativePath + "/image"}
								name="_method"
								value="delete"
								onclick={confirm(t("INITIATIVE_IMAGE_CONFIRM_REMOVAL"))}
								class="link-button">
								{t("INITIATIVE_IMAGE_REMOVE_IMAGE")}
							</FormButton>
						</menu> : null}

						{imageEditable ? <Form
							req={req}
							id="initiative-image-author-form"
							method="put"
							action={initiativePath + "/image"}>
							<h4 class="form-header">
								{t("INITIATIVE_IMAGE_AUTHOR_NAME_LABEL")}
							</h4>

							<input
								name="author_name"
								type="text"
								class="form-input"
								value={image.author_name}
							/>

							<h4 class="form-header">
								{t("INITIATIVE_IMAGE_AUTHOR_URL_LABEL")}
							</h4>

							<input
								name="author_url"
								type="url"
								class="form-input"
								placeholder="https://"
								value={image.author_url}
							/>

							<p>{t("INITIATIVE_IMAGE_AUTHOR_URL_DESCRIPTION")}</p>

							<div class="form-buttons">
								<button type="submit" class="green-button">
									{t("INITIATIVE_IMAGE_AUTHOR_UPDATE")}
								</button>

								<span class="form-or">{t("FORM_OR")}</span>

								<label class="link-button" for="initiative-image-author-toggle">
									{t("INITIATIVE_IMAGE_AUTHOR_CANCEL")}
								</label>
							</div>
						</Form> : null}
					</figure> : imageEditable ? <InitiativeImageUploadForm
						id="initiative-image-form"
						req={req}
						initiative={initiative}>
						<a>{t("INITIATIVE_IMAGE_ADD_IMAGE")}</a>
						<p>{Jsx.html(t("INITIATIVE_IMAGE_ADD_IMAGE_DESCRIPTION"))}</p>
					</InitiativeImageUploadForm> : null}

					{initiative.published_at ? <Fragment>
						<h3 class="sidebar-subheader">{t("SHARE_INITIATIVE")}</h3>

						<a
							href={"https://facebook.com/sharer/sharer.php?u=" + encode(initiativeUrl)}
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
					text={text}
					hasComments={comments.length > 0}
					signatureCount={signatureCount}
				/>

				<SidebarInfoView
					req={req}
					user={user}
					initiative={initiative}
				/>

				<SidebarSubscribeView
					req={req}
					initiative={initiative}
					subscriberCounts={subscriberCounts}
				/>

				<SidebarAdminView
					req={req}
					initiative={initiative}
				/>
			</aside>
		</center></section>

		<EventsView
			t={t}
			user={user}
			initiative={initiative}
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
  var sigs = attrs.signatureCount
	var phase = initiative.phase
  var acceptedByParliamentAt = initiative.accepted_by_parliament_at
	var finishedInParliamentAt = initiative.finished_in_parliament_at
	var sentToGovernmentAt = initiative.sent_to_government_at
	var finishedInGovernmentAt = initiative.finished_in_government_at

	var receivedByParliamentAt = (
		initiative.received_by_parliament_at ||
		initiative.sent_to_parliament_at
	)

  var daysSinceCreated = diffInDays(new Date, initiative.created_at)

  var daysInEdit = initiative.discussion_ends_at ? diffInDays(
		initiative.discussion_ends_at,
		initiative.created_at
	) + 1 : 0

	var editProgress = isPhaseAfter("edit", phase)
		? 1
		: min(daysSinceCreated / daysInEdit, 1)

	var editPhaseText
	if (phase == "edit") {
		if (!initiative.published_at)
			editPhaseText = ""
		else if (new Date < initiative.discussion_ends_at)
			editPhaseText = t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {
				numberOfDaysLeft: daysInEdit - daysSinceCreated
			})
		else editPhaseText = t("DISCUSSION_FINISHED")
	}
	else if (initiative.external)
		editPhaseText = ""
	// TODO: Use initiative.published_at here once old CitizenOS initiatives have
	// it adjusted from the imported 1970-01-01 time.
	else if (initiative.signing_started_at) editPhaseText = I18n.formatDateSpan(
		"numeric",
		initiative.created_at,
		initiative.signing_started_at
	)

	var signProgress = isPhaseAfter("sign", phase)
		? 1
		: sigs / getRequiredSignatureCount(initiative)

  var signPhaseText

	if (isPhaseAtLeast("sign", phase)) {
		if (initiative.external)
			signPhaseText = t("N_SIGNATURES_EXTERNAL")
		else if (initiative.has_paper_signatures)
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

	var governmentProgress
  var governmentPhaseText

	if (
		isPhaseAtLeast("government", phase) &&
		(phase == "government" || sentToGovernmentAt)
	) {
		governmentProgress = (
			isPhaseAfter("government", phase) ||
			finishedInGovernmentAt
		) ? 1 : 0

		governmentPhaseText = finishedInGovernmentAt ? I18n.formatDateSpan(
			"numeric",
			sentToGovernmentAt,
			finishedInGovernmentAt
		) : sentToGovernmentAt
			? I18n.formatDate("numeric", sentToGovernmentAt)
			: ""
	}

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

			<li
				id="parliament-phase"
				class={
					classifyPhase("parliament", phase) +
					(governmentProgress != null ? " with-government" : "")
				}
			>
        <i>{t("PARLIAMENT_PHASE")}</i>
				<ProgressView
					before={initiative.parliament_committee}
					value={parliamentProgress}
					text={parliamentPhaseText}
				/>
      </li>

			{governmentProgress != null ? <li
				id="government-phase"
				class={classifyPhase("government", phase)}
			>
        <i>{t("GOVERNMENT_PHASE")}</i>
				<ProgressView
					before={initiative.government_agency}
					value={governmentProgress}
					text={governmentPhaseText}
				/>
      </li> : null}

			{phase == "done" && initiative.archived_at ? <li
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
		var before = attrs && attrs.before
		var text = attrs && attrs.text

		// Linebreaks are for alignment _and_ rendering without CSS.
		return <label class="progress">
			{before}<br />
			<progress value={value == null ? null : min(1, value)} /><br />
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
	var text = attrs.text
	var initiativePath = "/initiatives/" + initiative.uuid
	var files = attrs.files

	if (initiative.external) {
		var pdf = files.find((file) => file.content_type == "application/pdf")
		if (pdf == null) return null

		return <article class="pdf">
			<object
				data={initiativePath + "/files/" + pdf.id}
				type={pdf.content_type}
			/>
		</article>
	}

	if (text) switch (String(text.content_type)) {
		case "text/html":
			return <article class="text">{Jsx.html(text.content)}</article>

		case "application/vnd.basecamp.trix+json":
			return <article class="text trix-text">
				{Trix.render(text.content, {heading: "h2"})}
			</article>

		case "application/vnd.citizenos.etherpad+html":
			var html = normalizeCitizenOsHtml(text.content)
			html = html.match(/<body>([^]*)<\/body>/m)[1]
			return <article class="text citizenos-text">{Jsx.html(html)}</article>

		default:
			throw new RangeError("Unsupported content type: " + text.content_type)
	}

	return null
}

function SidebarAuthorView(attrs) {
	var req = attrs.req
	var t = req.t
	var user = req.user
	var text = attrs.text
	var initiative = attrs.initiative
	var signatureCount = attrs.signatureCount
	var hasComments = attrs.hasComments

	var isAuthor = user && initiative.user_id == user.id
	if (!isAuthor) return null

	var actions = <Fragment>
		{initiative.phase == "edit" ? <Fragment>
			<Form
				req={req}
				id="initiative-destination-form"
				method="put"
				action={"/initiatives/" + initiative.uuid}
			>
				<h3 class="sidebar-subheader">Algatuse saaja</h3>

				<InitiativeDestinationSelectView
					name="destination"
					initiative={initiative}
					placeholder="Vali Riigikogu või omavalitsus…"
					class="form-select"
					onchange="this.form.submit()"
				/>

				<p>
					Algatuse saajat saad muuta, kuniks alustad allkirjade kogumist. Kui
					sa ei ole kindel, kellele algatus suunata, <a
					class="link-button" href={"mailto:" + Config.helpEmail}>võta meiega
					ühendust</a>.
				</p>
			</Form>
		</Fragment> : null}

		{!initiative.published_at && text ? <FormButton
			req={req}
			action={"/initiatives/" + initiative.uuid}
			name="visibility"
			value="public"
			class="green-button wide-button">
			{t("PUBLISH_TOPIC")}
		</FormButton> : null}

		{Initiative.canPropose(new Date, initiative, user) ? <Fragment>
			<FormButton
				req={req}
				action={"/initiatives/" + initiative.uuid}
				name="status"
				value="voting"
				disabled={initiative.destination == null}
				class="green-button wide-button">
				{t("BTN_SEND_TO_VOTE")}
			</FormButton>

			{initiative.destination == null ? <p>
				Allkirjastamisele saatmiseks on vaja enne valida algatuse saaja.
			</p> : null}
		</Fragment> : null}

		{Initiative.canSendToParliament(initiative, user, signatureCount) ?
			<FormButton
				req={req}
				action={"/initiatives/" + initiative.uuid}
				name="status"
				value="followUp"
				class="green-button wide-button">
				{t("SEND_TO_PARLIAMENT")}
			</FormButton>
		: null}

		{initiative.phase == "edit" ? <a
			href={"/initiatives/" + initiative.uuid + "/edit"}
			class="link-button wide-button">
			{t("EDIT_INITIATIVE_TEXT")}
		</a> : null}

		{initiative.phase == "edit" && initiative.published_at ? <FormButton
			req={req}
			action={"/initiatives/" + initiative.uuid}
			name="visibility"
			value="public"
			class="link-button wide-button">
			{t("RENEW_DEADLINE")}
		</FormButton> : null}

		{Initiative.canUpdateSignDeadline(initiative, user) ? <FormButton
			req={req}
			action={"/initiatives/" + initiative.uuid}
			name="status"
			value="voting"
			class="link-button wide-button">
			{t("RENEW_DEADLINE")}
		</FormButton> : null}

		{(
			initiative.phase == "edit" &&
			(!hasComments || !initiative.published_at)
		) ? <FormButton
			req={req}
			action={"/initiatives/" + initiative.uuid}
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
	var user = attrs.user
	var initiative = attrs.initiative
	var canEdit = user && initiative.user_id == user.id
	var phase = initiative.phase
	var authorName = initiative.author_name
	var authorUrl = initiative.author_url
	var communityUrl = initiative.community_url
	var externalUrl = initiative.url
	var organizations = initiative.organizations
	var mediaUrls = initiative.media_urls
	var meetings = initiative.meetings
	var notes = initiative.notes
	var governmentChangeUrls = initiative.government_change_urls
	var publicChangeUrls = initiative.public_change_urls

	if (!(
		canEdit ||
		authorName ||
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
		action={"/initiatives/" + initiative.uuid}>
		<input type="checkbox" id="initiative-info-form-toggle" hidden />

		<h2 class="sidebar-header">
			{canEdit ? <label
				class="edit-button link-button"
				for="initiative-info-form-toggle">
				{t("EDIT_INITIATIVE_INFO")}
			</label> : null}

			Lisainfo
		</h2>

		{authorName || authorUrl || canEdit ? <Fragment>
			<h3 class="sidebar-subheader">{t("INITIATIVE_INFO_AUTHOR_TITLE")}</h3>

			{authorName || authorUrl ?
				<UntrustedLink class="form-output" href={authorUrl}>
					{authorName || null}
				</UntrustedLink>
			: null}

			{canEdit ? <div class="form-fields">
				<h4 class="form-header">{t("INITIATIVE_INFO_AUTHOR_NAME_TITLE")}</h4>

				<input
					name="author_name"
					type="name"
					class="form-input"
					value={authorName}
				/>

				<p>{t("INITIATIVE_INFO_AUTHOR_NAME_DESCRIPTION")}</p>
			</div> : null}

			{canEdit ? <div class="form-fields">
				<h4 class="form-header">{t("INITIATIVE_INFO_AUTHOR_URL_TITLE")}</h4>

				<input
					name="author_url"
					type="url"
					class="form-input"
					placeholder="https://"
					value={authorUrl}
				/>

				<p>{t("INITIATIVE_INFO_AUTHOR_URL_DESCRIPTION")}</p>
			</div> : null}

			{authorName || authorUrl ? null : <AddInitiativeInfoButton t={t} /> }
		</Fragment> : null}

		{communityUrl || canEdit ? <InitiativeAttribute
			t={t}
			editable={canEdit}
			title={t("INITIATIVE_INFO_COMMUNITY_URL_TITLE")}
			help={t("INITIATIVE_INFO_COMMUNITY_URL_DESCRIPTION")}
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

		{initiative.notes || canEdit ? <InitiativeAttribute
			t={t}
			editable={canEdit}
			type="textarea"
			title={t("NOTES_HEADER")}
			name="notes"
			value={initiative.notes}
		>
			<p class="text form-output">{Jsx.html(linkify(initiative.notes))}</p>
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
	var subscriberCounts = attrs.subscriberCounts
	var atomPath = req.baseUrl + req.url + ".atom"

	if (!initiative.published_at) return null

	return <div class="sidebar-section">
		<h2 class="sidebar-header">{t("INITIATIVE_SIDEBAR_FOLLOW_HEADER")}</h2>

		<h3 class="sidebar-subheader">{t("INITIATIVE_SIDEBAR_SUBSCRIBE")}</h3>

		<SubscribeEmailView
			req={req}
			initiative={initiative}
			count={subscriberCounts.initiative}
			allCount={subscriberCounts.all}
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

	if (!(req.user && isAdmin(req.user))) return null

	return <div class="sidebar-section">
		<h2 class="sidebar-header">Administraatorile</h2>
		<a
			href={`${Config.adminUrl}/initiatives/${initiative.uuid}`}
			class="link-button wide-button">
			Administreeri algatust
		</a>
	</div>
}

function SigningView(attrs) {
	var t = attrs.t
	var req = attrs.req
	var action = attrs.action

	return <Fragment>
		<input
			type="radio"
			id="signature-method-tab-id-card"
			name="signature-method-tab"
			value="id-card"
			style="display: none"
		/>

		<input
			type="radio"
			name="signature-method-tab"
			id="signature-method-tab-mobile-id"
			value="mobile-id"
			style="display: none"
		/>

		<input
			type="radio"
			name="signature-method-tab"
			id="signature-method-tab-smart-id"
			value="smart-id"
			style="display: none"
		/>

		<div id="signature-methods">
			<label
				id="id-card-button"
				for="signature-method-tab-id-card"
				class="inherited-button"
			>
				<img
					src="/assets/id-kaart-button.png"
					title={t("BTN_VOTE_SIGN_WITH_ID_CARD")}
					alt={t("BTN_VOTE_SIGN_WITH_ID_CARD")}
				/>
			</label>

			<label
				for="signature-method-tab-mobile-id"
				class="inherited-button"
			>
				<img
					src="/assets/mobile-id-button.png"
					title={t("BTN_VOTE_SIGN_WITH_MOBILE_ID")}
					alt={t("BTN_VOTE_SIGN_WITH_MOBILE_ID")}
				/>
			</label>

			{Config.smartId ? <label
				for="signature-method-tab-smart-id"
				class="inherited-button"
			>
				<img
					src="/assets/smart-id-button.svg"
					title={t("BTN_VOTE_SIGN_WITH_SMART_ID")}
					alt={t("BTN_VOTE_SIGN_WITH_SMART_ID")}
				/>
			</label> : null}
		</div>

		<Form
			req={req}
			id="id-card-form"
			class="signature-form"
			method="post"
			action={action}>
			<p id="id-card-flash" class="flash error" />
		</Form>

		<Form
			req={req}
			id="mobile-id-form"
			class="signature-form"
			method="post"
			action={action}>

			<label class="form-label">
				{t("LABEL_PHONE_NUMBER")}

				<input
					type="tel"
					name="phoneNumber"
					placeholder={t("PLACEHOLDER_PHONE_NUMBER")}
					required
					class="form-input"
				/>
			</label>

			<label class="form-label">
				{t("LABEL_PERSONAL_ID")}

				<input
					type="text"
					pattern="[0-9]*"
					inputmode="numeric"
					name="personalId"
					placeholder={t("PLACEHOLDER_PERSONAL_ID")}
					required
					class="form-input"
				/>
			</label>

			<button
				name="method"
				value="mobile-id"
				class="button green-button">
				{t("BTN_VOTE_SIGN_WITH_MOBILE_ID")}
			</button>
		</Form>

		{Config.smartId ? <Form
			req={req}
			id="smart-id-form"
			class="signature-form"
			method="post"
			action={action}>
			<label class="form-label">
				{t("LABEL_PERSONAL_ID")}

				<input
					type="text"
					pattern="[0-9]*"
					inputmode="numeric"
					name="personalId"
					placeholder={t("PLACEHOLDER_PERSONAL_ID")}
					required
					class="form-input"
				/>
			</label>

			<button
				name="method"
				value="smart-id"
				class="green-button">
				{t("BTN_VOTE_SIGN_WITH_SMART_ID")}
			</button>
		</Form> : null}

		<script>{javascript`
			var each = Function.call.bind(Array.prototype.forEach)

			var inputs = [
				document.querySelector("#mobile-id-form input[name=personalId]"),
				document.querySelector("#smart-id-form input[name=personalId]")
			]

			inputs.forEach(function(from) {
				from.addEventListener("change", function(ev) {
					each(inputs, function(to) {
						if (to != from) to.value = ev.target.value
					})
				})
			})	
		`}</script>

		<script>{javascript`
			var Hwcrypto = require("@rahvaalgatus/hwcrypto")
			var TRANSLATIONS = ${stringify(UI_TRANSLATIONS[req.lang])}
			var button = document.getElementById("id-card-button")
			var form = document.getElementById("id-card-form")
			var flash = document.getElementById("id-card-flash")
			var all = Promise.all.bind(Promise)

			button.addEventListener("click", sign)

			form.addEventListener("submit", function(ev) {
				ev.preventDefault()
				sign()
			})

			function sign() {
				notice("")

				var certificate = Hwcrypto.certificate("sign")

				var signable = certificate.then(function(certificate) {
					return fetch(form.action, {
						method: "POST",
						credentials: "same-origin",

						headers: {
							"X-CSRF-Token": ${stringify(req.csrfToken)},
							"Content-Type": "application/pkix-cert",
							Accept: "${SIGNABLE_TYPE}, ${ERR_TYPE}"
						},

						body: certificate.toDer()
					}).then(assertOk).then(function(res) {
						return res.arrayBuffer().then(function(signable) {
							return [
								res.headers.get("location"),
								new Uint8Array(signable)
							]
						})
					})
				})

				var signature = all([certificate, signable]).then(function(all) {
					var certificate = all[0]
					var signable = all[1][1]
					return Hwcrypto.sign(certificate, "SHA-256", signable)
				})

				var done = all([signable, signature]).then(function(all) {
					var url = all[0][0]
					var signature = all[1]

					return fetch(url, {
						method: "PUT",
						credentials: "same-origin",
						redirect: "manual",

						headers: {
							"X-CSRF-Token": ${stringify(req.csrfToken)},
							"Content-Type": "application/vnd.rahvaalgatus.signature",

							// Fetch polyfill doesn't support manual redirect, so use
							// x-empty.
							Accept: "application/x-empty, ${ERR_TYPE}"
						},

						body: signature
					}).then(assertOk).then(function(res) {
						window.location.assign(res.headers.get("location"))
					})
				})

				done.catch(noticeError)
				done.catch(raise)
			}

			function noticeError(err) {
				notice(
					err.code && TRANSLATIONS[err.code] ||
					err.description ||
					err.message
				)
			}

			function assertOk(res) {
				if (res.status >= 200 && res.status < 400) return res

				var err = new Error(res.statusText)
				err.code = res.status

				var type = res.headers.get("content-type")
				if (type == "${ERR_TYPE}")
					return res.json().then(function(body) {
						err.description = body.description
						throw err
					})
				else throw err
			}

			function notice(msg) { flash.textContent = msg }
			function raise(err) { setTimeout(function() { throw err }) }
		`}</script>
	</Fragment>
}

function EventsView(attrs) {
	var t = attrs.t
	var user = attrs.user
	var initiative = attrs.initiative
	var events = attrs.events.sort(compareEvent).reverse()
	var initiativePath = "/initiatives/" + initiative.uuid
	var canCreateEvents = user && initiative.user_id == user.id

	if (events.length > 0 || canCreateEvents)
		return <section id="initiative-events" class="transparent-section"><center>
			<a name="events" />

			<article class="sheet">
				{canCreateEvents ? <a
					href={`/initiatives/${initiative.uuid}/events/new`}
					class="create-event-button">
					{t("CREATE_INITIATIVE_EVENT_BUTTON")}
				</a> : null}

        <ol class="events">{events.map(function(event) {
					var title
					var authorName
					var content
					var summary
					var decision
					var klass = `event ${event.type}-event`
					var phase = initiativePhaseFromEvent(event)
					if (phase) klass += ` ${phase}-phase`
					if (event.origin == "author") klass += " author-event"

					switch (event.type) {
						case "signature-milestone":
							title = t("SIGNATURE_MILESTONE_EVENT_TITLE", {
								milestone: event.content
							})
							break

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

							var committee = event.content.committee
							if (committee) content = <p class="text">
								{t("PARLIAMENT_ACCEPTED_SENT_TO_COMMITTEE", {
									committee: committee
								})}
							</p>
							break

						case "parliament-board-meeting":
							title = t("PARLIAMENT_BOARD_MEETING")
							break

						case "parliament-committee-meeting":
							var meeting = event.content
							decision = meeting.decision
							var invitees = meeting.invitees
							summary = meeting.summary

							title = meeting.committee
								? t("PARLIAMENT_COMMITTEE_MEETING_BY", {
									committee: meeting.committee
								})
								: t("PARLIAMENT_COMMITTEE_MEETING")

							content = <Fragment>
								{invitees ? <table class="event-table">
									<tr>
										<th scope="row">{t("PARLIAMENT_MEETING_INVITEES")}</th>
										<td><ul>{invitees.split(",").map((invitee) => (
											<li>{invitee}</li>
										))}</ul></td>
									</tr>
								</table> : null}

								{summary ? <p class="text">
									{Jsx.html(linkify(summary))}
								</p> :

								decision ? <p class="text">{
									decision == "continue"
									? t("PARLIAMENT_MEETING_DECISION_CONTINUE")
									: decision == "reject"
									? t("PARLIAMENT_MEETING_DECISION_REJECT")
									: decision == "forward"
									? t("PARLIAMENT_MEETING_DECISION_FORWARD")
									: decision == "solve-differently"
									? t("PARLIAMENT_MEETING_DECISION_SOLVE_DIFFERENTLY")
									: decision == "draft-act-or-national-matter"
									? t("PARLIAMENT_MEETING_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
									: null
								}</p> : null}
							</Fragment>
							break

						case "parliament-decision":
							title = t("PARLIAMENT_DECISION")

							summary = event.content.summary
							if (summary)
								content = <p class="text">{Jsx.html(linkify(summary))}</p>
							break

						case "parliament-letter":
							var letter = event.content
							summary = letter.summary

							title = letter.direction == "incoming"
								? t("PARLIAMENT_LETTER_INCOMING")
								: t("PARLIAMENT_LETTER_OUTGOING")

							content = <Fragment>
								<table class="event-table">
									<tr>
										<th scope="row">{t("PARLIAMENT_LETTER_TITLE")}</th>
										<td>{letter.title}</td>
									</tr>
									{letter.direction == "incoming" ? <tr>
										<th scope="row">{t("PARLIAMENT_LETTER_FROM")}</th>
										<td><ul>{splitRecipients(letter.from).map((from) => (
											<li>{from}</li>
										))}</ul></td>
									</tr> : <tr>
										<th scope="row">{t("PARLIAMENT_LETTER_TO")}</th>
										<td><ul>{splitRecipients(letter.to).map((to) => (
											<li>{to}</li>
										))}</ul></td>
									</tr>}
								</table>

								{summary && <p class="text">{Jsx.html(linkify(summary))}</p>}
							</Fragment>
							break

						case "parliament-interpellation":
							title = t("PARLIAMENT_INTERPELLATION")
							var interpellation = event.content
							var deadline = Time.parseDate(interpellation.deadline)

							content = <Fragment>
								<table class="event-table">
									<tr>
										<th scope="row">{t("PARLIAMENT_INTERPELLATION_TO")}</th>
										<td>{interpellation.to}</td>
									</tr>
									<tr>
										<th scope="row">
											{t("PARLIAMENT_INTERPELLATION_DEADLINE")}
										</th>

										<td>{I18n.formatDate("numeric", deadline)}</td>
									</tr>
								</table>
							</Fragment>
							break

						case "parliament-national-matter":
							title = t("PARLIAMENT_NATIONAL_MATTER")
							break

						case "parliament-finished":
							decision = initiative.parliament_decision
							title = t("PARLIAMENT_FINISHED")

							if (decision) content = <p class="text">{
								decision == "reject"
								? t("PARLIAMENT_DECISION_REJECT")
								: decision == "forward"
								? t("PARLIAMENT_DECISION_FORWARD")
								: decision == "solve-differently"
								? t("PARLIAMENT_DECISION_SOLVE_DIFFERENTLY")
								: decision == "draft-act-or-national-matter"
								? t("PARLIAMENT_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
								: null
								}</p>
							break

						case "sent-to-government":
							title = !initiative.government_agency
								? t("EVENT_SENT_TO_GOVERNMENT_TITLE")
								: t("EVENT_SENT_TO_GOVERNMENT_TITLE_WITH_AGENCY", {
									agency: initiative.government_agency
								})
							break

						case "finished-in-government":
							title = !initiative.government_agency
								? t("EVENT_FINISHED_IN_GOVERNMENT_TITLE")
								: t("EVENT_FINISHED_IN_GOVERNMENT_TITLE_WITH_AGENCY", {
									agency: initiative.government_agency
								})

							if (initiative.government_decision) content = <p class="text">
								{t("EVENT_FINISHED_IN_GOVERNMENT_CONTENT", {
									decision: initiative.government_decision
								})}
							</p>
							break

						case "text":
							title = event.title
							authorName = event.origin == "author" ? event.user_name : null
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

						<div class="metadata">
							<time class="occurred-at" datetime={event.occurred_at.toJSON()}>
								<a href={`#event-${event.id}`}>
									{I18n.formatDate("numeric", event.occurred_at)}
								</a>
							</time>

							{authorName ? <Fragment>
								{", "}
								<span class="author">{authorName}</span>
							</Fragment> : null}
						</div>

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

	else if (isPhaseAtLeast("parliament", initiative))
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
	var user = req.user
	var initiative = attrs.initiative
	var count = attrs.count
	var allCount = attrs.allCount
	var counts = {count: count, allCount: allCount}

	return <Form
		req={req}
		class="initiative-subscribe-form"
		method="post"
		action={`/initiatives/${initiative.uuid}/subscriptions`}>
		{/* Catch naive bots */}
		<input name="e-mail" type="email" hidden />

    <input
      id="initiative-subscribe-email"
      name="email"
      type="email"
			value={user && (user.email || user.unconfirmed_email)}
      required
      placeholder={t("LBL_EMAIL")}
      class="form-input"
    />

    <button type="submit" class="secondary-button">{t("BTN_SUBSCRIBE")}</button>

		{count || allCount ? <p>
			{Jsx.html(
				count && allCount ? t("INITIATIVE_SUBSCRIBER_COUNT_BOTH", counts) :
				count > 0 ? t("INITIATIVE_SUBSCRIBER_COUNT", counts) :
				allCount > 0 ? t("INITIATIVE_SUBSCRIBER_COUNT_ALL", counts) :
				null
			)}
		</p> : null}
	</Form>
}

function ProgressTextView(attrs) {
	var t = attrs.t
	var initiative = attrs.initiative
	var signatureCount = attrs.signatureCount

	switch (initiative.phase) {
		case "edit":
			return <p class="initiative-progress-text">
				<span>
					{t("DISCUSSION_DEADLINE")}
					{": "}
					<time datetime={initiative.discussion_ends_at}>
						{I18n.formatDateTime("numeric", initiative.discussion_ends_at)}
					</time>
				</span>
			</p>

		case "sign":
			var signatureThreshold = getRequiredSignatureCount(initiative)
			var missing = signatureThreshold - signatureCount

			return <p class="initiative-progress-text">
				<span>
					{signatureCount >= signatureThreshold
						? Jsx.html(t("SIGNATURES_COLLECTED_FOR_" + initiative.destination))
						: Jsx.html(t("MISSING_N_SIGNATURES_FOR_" + initiative.destination, {
							signatures: missing
						}))
					}
				</span>
				{" "}
				<span>
					{t("VOTING_DEADLINE")}
					{": "}
					<time datetime={initiative.signing_ends_at} class="deadline">
						{I18n.formatDateTime("numeric", initiative.signing_ends_at)}
					</time>.
				</span>
			</p>

		default: return null
	}
}

function QuicksignView(attrs) {
	var t = attrs.t
	var req = attrs.req
	var initiative = attrs.initiative
	var signature = attrs.signature
	var signatureCount = attrs.signatureCount

	if (!initiative.published_at) return null

	return <div class="quicksign">
		<ProgressView
			t={t}
			initiative={initiative}
			signatureCount={signatureCount}
		/>

		{isSignable(initiative) && !signature ? <a
			href="#initiative-vote"
			class="green-button wide-button sign-button">
			{t("SIGN_THIS_DOCUMENT")}
			</a>
		: null}

		<ProgressTextView
			t={t}
			initiative={initiative}
			signatureCount={signatureCount}
		/>

		{isSignable(initiative) && signature ? <Fragment>
			<h2>{t("THANKS_FOR_SIGNING")}</h2>
			<DeleteSignatureButton req={req} signature={signature}>
				{t("REVOKE_SIGNATURE")}
			</DeleteSignatureButton>
		</Fragment> : null}
	</div>
}

function InitiativeDestinationSelectView(attrs) {
	var initiative = attrs.initiative
	var dest = initiative.destination
	var placeholder = attrs.placeholder

	return <select
		name={attrs.name}
		class={attrs.class}
		onchange={attrs.onchange}
	>
		<option value="" selected={dest == null}>{placeholder}</option>

		<optgroup label="Riiklik">
			<option value="parliament" selected={dest == "parliament"}>
				Riigikogu
			</option>
		</optgroup>

		{_.map(LOCAL_GOVERNMENTS_BY_COUNTY, (govs, county) => (
			<optgroup label={county + " maakond"}>{govs.map(([id, name]) => (
				<option value={id} selected={dest == id}>
					{name}
				</option>
			))}</optgroup>
		))}
	</select>
}

function InitiativeLocationView(attrs) {
	var t = attrs.t
	var initiative = attrs.initiative

	var content
	if (initiative.phase == "parliament" && initiative.parliament_committee) {
		content = <Fragment>
			{Jsx.html(t("INITIATIVE_IS_IN_PARLIAMENT_COMMITTEE", {
				committee: _.escapeHtml(initiative.parliament_committee)
			}))}
		</Fragment>
	}
	else if (initiative.phase == "government" && initiative.government_agency) {
		content = <Fragment>
			{Jsx.html(t("INITIATIVE_IS_IN_GOVERNMENT_AGENCY", {
				agency: _.escapeHtml(initiative.government_agency)
			}))}<br />

			{initiative.government_contact ? <Fragment>
				<br />
				<strong>{t("GOVERNMENT_AGENCY_CONTACT")}</strong>:<br />
				{initiative.government_contact}<br />
				{Jsx.html(linkify(initiative.government_contact_details || ""))}
			</Fragment> : null}
		</Fragment>
	}

	if (content == null) return null
	else return <p id="initiative-location">{content}</p>
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
	children = children ? children.filter(Boolean) : EMPTY_ARR
	var text = children.length ? children : href

	if (HTTP_URL.test(href)) return <a {...attrs} class={klass + " link-button"}>
		{text}
	</a>
	else return <span class={klass}>{text}</span>
}

function InitiativeImageUploadForm(attrs, children) {
	var req = attrs.req
	var initiative = attrs.initiative
	var initiativePath = "/initiatives/" + initiative.uuid

	return <Form
		id={attrs.id}
		class={attrs.class}
		req={req}
		action={initiativePath + "/image"}
		method="put"
		enctype="multipart/form-data"
	>
		<label>
			<input
				type="file"
				name="image"
				required
				hidden
				onchange="this.form.submit()"
			/>

			{children}
		</label>
	</Form>
}

function AddInitiativeInfoButton(attrs) {
	var t = attrs.t

	return <label
		class="edit-button link-button"
		for="initiative-info-form-toggle">
		{t("ADD_INITIATIVE_INFO")}
	</label>
}

function DeleteSignatureButton(attrs, children) {
	var req = attrs.req
	var signature = attrs.signature
	var initiativePath = "/initiatives/" + signature.initiative_uuid

	return <FormButton
		req={req}
		class="link-button revoke-button"
		action={initiativePath + "/signatures/" + pathToSignature(signature)}
		onclick={confirm(req.t("REVOKE_SIGNATURE_CONFIRMATION"))}
		name="_method"
		value="delete">
		{children}
	</FormButton>
}

function isPhaseAtLeast(than, phase) {
	return PHASES.indexOf(phase) >= PHASES.indexOf(than)
}

function isPhaseAfter(than, phase) {
	return PHASES.indexOf(phase) > PHASES.indexOf(than)
}


function isSignable(initiative) {
	return initiative.phase == "sign" && new Date < initiative.signing_ends_at
}

function initiativePhaseFromEvent(event) {
	switch (event.type) {
		case "signature-milestone": return "sign"
		case "sent-to-parliament":
		case "parliament-received":
		case "parliament-accepted":
		case "parliament-letter":
		case "parliament-interpellation":
		case "parliament-national-matter":
		case "parliament-board-meeting":
		case "parliament-committee-meeting":
		case "parliament-decision":
		case "parliament-finished": return "parliament"
		case "sent-to-government": return "government"
		case "finished-in-government": return "government"
		case "text": return null
		default: throw new RangeError("Unsupported event type: " + event.type)
	}
}

var EVENT_ORDER = [
	"sent-to-parliament",
	"parliament-received",
	"parliament-accepted",
	"parliament-finished",
	"sent-to-government",
	"finished-in-government"
]

// This comparison function is not transitive, but works with
// Array.prototype.sort's implementation.
function compareEvent(a, b) {
	if (EVENT_ORDER.includes(a.type) && EVENT_ORDER.includes(b.type))
		return EVENT_ORDER.indexOf(a.type) - EVENT_ORDER.indexOf(b.type)
	else
		return +a.occurred_at - +b.occurred_at
}

function renderImageAuthor(image) {
	var name = image.author_name, url = image.author_url
	if (name && url) return <UntrustedLink class="author" href={url}>
		{name || null}
	</UntrustedLink>

	if (name) return <span class="author">{name}</span>

	if (url) return <UntrustedLink class="author" href={url}>
		{getUrlHost(url)}
	</UntrustedLink>

	return null

	function getUrlHost(url) {
		try { return Url.parse(url).hostname }
		catch (_ex) { return null }
	}
}

function splitRecipients(recipients) { return recipients.split(/[;,]/) }

/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Url = require("url")
var Jsx = require("j6pack")
var Time = require("root/lib/time")
var DateFns = require("date-fns")
var InitiativePage = require("./initiative_page")
var Config = require("root").config
var I18n = require("root/lib/i18n")
var {Flash} = require("../page")
var {Form} = require("../page")
var Trix = require("root/lib/trix")
var Initiative = require("root/lib/initiative")
var ImageController = require("root/controllers/initiatives/image_controller")
var {FormButton} = require("../page")
var {DonateForm} = require("../donations/create_page")
var {CommentView} = require("./comments/read_page")
var {CommentForm} = require("./comments/create_page")
var {ProgressView} = require("./initiative_page")
var {CoauthorInvitationForm} = require("./coauthor_invitation_page")
var EidView = require("../eid_view")
var {getSignatureThreshold} = require("root/lib/initiative")
var {isAdmin} = require("root/lib/user")
var {selected} = require("root/lib/css")
var {javascript} = require("root/lib/jsx")
var serializeInitiativeUrl = require("root/lib/initiative").initiativeUrl
var serializeImageUrl = require("root/lib/initiative").imageUrl
var {pathToSignature} =
	require("root/controllers/initiatives/signatures_controller")
var {confirm} = require("root/lib/jsx")
var linkify = require("root/lib/linkify")
var encode = encodeURIComponent
var {min} = Math
var {normalizeCitizenOsHtml} = require("root/lib/initiative")
var diffInDays = DateFns.differenceInCalendarDays
var {PHASES} = require("root/lib/initiative")
var HTTP_URL = /^https?:\/\//i
var EMPTY_ARR = Array.prototype
var EMPTY_ORG = {name: "", url: ""}
var EVENT_NOTIFICATIONS_SINCE = new Date(Config.eventNotificationsSince)
var LANGUAGES = require("root").config.languages
var {SCHEMA} = require("root/controllers/initiatives_controller")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
var LOCAL_GOVERNMENTS_BY_COUNTY = LOCAL_GOVERNMENTS.BY_COUNTY
var IMAGE_SCHEMA = ImageController.SCHEMA
exports = module.exports = ReadPage
exports.InitiativeDestinationSelectView = InitiativeDestinationSelectView

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

var FILE_TYPE_ICONS = {
	"text/html": "ra-icon-html",
	"application/pdf": "ra-icon-pdf",
	"text/plain": "ra-icon-txt",
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
	var {req} = attrs
	var {t} = attrs
	var {user} = req
  var {lang} = req
	var {thank} = attrs
	var {thankAgain} = attrs
	var {signature} = attrs
	var {files} = attrs
	var {comments} = attrs
	var {subscription} = attrs
	var {flash} = attrs
	var {events} = attrs
	var {initiative} = attrs
	var initiativePath = "/initiatives/" + initiative.uuid
	var {subscriberCounts} = attrs
	var signatureCount = initiative.signature_count
	var {text} = attrs
	var {textLanguage} = attrs
	var {translations} = attrs
	var {image} = attrs
	var {coauthorInvitation} = attrs
	var initiativeUrl = serializeInitiativeUrl(initiative)
	var shareText = `${initiative.title} ${initiativeUrl}`
	var atomPath = req.baseUrl + req.path + ".atom"
	var isAuthor = user && Initiative.isAuthor(user, initiative)

	var imageEditable = (
		isAuthor &&
		initiative.phase != "done" &&
		!initiative.archived_at
	)

	return <InitiativePage
		page="initiative"
		title={initiative.title}
		req={req}
		initiative={initiative}

		class={[
			(initiative.external ? "disable-printing-text" : ""),
			(events.length == 0 ? "disable-printing-events" : ""),
			(comments.length == 0 ? "disable-printing-comments" : ""),
			"disable-printing-signatures-table"
		].join(" ")}

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
	>
		<script src="/assets/html5.js" />
		<script src="/assets/hwcrypto.js" />

		{initiative.destination ? <PhasesView
      t={t}
      initiative={initiative}
			signatureCount={signatureCount}
    /> : null}

		<section class="initiative-section transparent-section"><center>
			{!thank ? <QuicksignView
				req={req}
				t={t}
				class="mobile"
				initiative={initiative}
				signature={signature}
				signatureCount={signatureCount}
			/> : null}

			<div id="initiative-sheet" class="initiative-sheet">
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

				{coauthorInvitation ? <div
					id="coauthor-invitation"
					class="initiative-status"
				>
					<h2 class="status-serif-header">
						{t("INITIATIVE_COAUTHOR_INVITATION_PAGE_TITLE")}
					</h2>

					<p>{t("USER_PAGE_COAUTHOR_INVITATION_DESCRIPTION")}</p>
					<CoauthorInvitationForm req={req} invitation={coauthorInvitation} />
				</div> : null}

				{function(phase) {
					switch (phase) {
						case "edit":
							if (
								initiative.published_at &&
								new Date < initiative.discussion_ends_at
							) return <div class="initiative-status">
								<h1 class="status-header">
									{t("initiative_page.discussion_header.title")}
									{" "}
									<a
										href="#comment-form"
										class="link-button wide-button">
										{t("initiative_page.discussion_header.comment_button")}
									</a>.
								</h1>

								<p>
									{Jsx.html(t("initiative_page.discussion_header.description"))}
								</p>
							</div>
							else return null

						case "sign":
							var signatureThreshold = getSignatureThreshold(initiative)

							if (initiative.signing_ends_at <= new Date) {
								return <div class="initiative-status">
									{signatureCount >= signatureThreshold ? <>
                    <h1 class="status-header">
                      {t("N_SIGNATURES_COLLECTED", {votes: signatureCount})}
                    </h1>

										<p>{initiative.destination == "parliament"
											? (initiative.signing_expired_at == null
												? t("VOTING_SUCCEEDED")
												: t("VOTING_SUCCEEDED_AND_EXPIRED")
											)

											: (initiative.signing_expired_at == null
												? t("VOTING_SUCCEEDED_ON_LOCAL_LEVEL")
												: t("VOTING_SUCCEEDED_AND_EXPIRED_ON_LOCAL_LEVEL")
											)
										}</p>
									</> : <>
                    <h1 class="status-header">
                      {t("N_SIGNATURES_FAILED", {votes: signatureCount})}
                    </h1>

										<p>{initiative.destination == "parliament"
											? (initiative.signing_expired_at == null
												? t("VOTING_FAILED", {
													signatureCount: signatureThreshold
												})

												: t("VOTING_FAILED_AND_EXPIRED", {
													signatureCount: signatureThreshold
												})
											)

											: (initiative.signing_expired_at == null
												? t("VOTING_FAILED_ON_LOCAL_LEVEL", {
													signatureCount: signatureThreshold
												})

												: t("VOTING_FAILED_AND_EXPIRED_ON_LOCAL_LEVEL", {
													signatureCount: signatureThreshold
												})
											)
										}</p>
									</>}
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
								{initiative.destination == "parliament"
									? t("INITIATIVE_IN_GOVERNMENT")
									: t("INITIATIVE_IN_LOCAL_GOVERNMENT")
								}
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

				{!_.isEmpty(translations) ? <menu id="language-tabs">
					{LANGUAGES.map(function(lang) {
						if (!(initiative.language == lang || lang in translations))
							return null

						var path = initiativePath
						if (initiative.language != lang) path += "?language=" + lang
						var klass = "tab " + selected(textLanguage, lang)

						return <a href={path} class={klass}>{Jsx.html(
							initiative.language != lang
							? t("INITIATIVE_LANG_TAB_TRANSLATION_" + lang.toUpperCase())
							: initiative.phase == "sign"
							? t("INITIATIVE_LANG_TAB_SIGNABLE_" + lang.toUpperCase())
							: t("INITIATIVE_LANG_TAB_" + lang.toUpperCase())
						)}</a>
					})}
				</menu> : null}

				<InitiativeContentView
					initiative={initiative}
					text={text}
					files={files}
				/>

				{Initiative.isSignable(new Date, initiative) ? <div
					id="initiative-vote"
				>
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

					{signature ? <>
						<h2>{t("THANKS_FOR_SIGNING")}</h2>

						<div class="signature-buttons">
							<DownloadSignatureButton signature={signature}>
								{t("DOWNLOAD_SIGNATURE")}
							</DownloadSignatureButton>

							<span class="form-or">{t("FORM_OR")}</span>

							<DeleteSignatureButton req={req} signature={signature}>
								{t("REVOKE_SIGNATURE")}
							</DeleteSignatureButton>
						</div>
					</> : <>
						<h2>{t("INITIATIVE_SIGN_HEADING")}</h2>
						<p>
							{(initiative.language != textLanguage) ? <>
								{Jsx.html(t("INITIATIVE_SIGN_TRANSLATION_WARNING", {
									language: t(
										"INITIATIVE_SIGN_TRANSLATION_WARNING_TEXT_IN_" +
										initiative.language.toUpperCase()
									),

									translation: t(
										"INITIATIVE_SIGN_TRANSLATION_WARNING_TRANSLATION_IN_" +
										textLanguage.toUpperCase()
									)
								}))}

								{" "}

								{Jsx.html(t(
									"INITIATIVE_SIGN_TRANSLATION_WARNING_SIGN_IN_" +
									initiative.language.toUpperCase()
								))}

								{" "}
							</> : null}

							{Jsx.html(initiative.destination == "parliament"
								? t("initiative_page.signing_section.description.parliament")
								: t(
									"initiative_page.signing_section.description." +
									initiative.destination
								)
							)}
							</p>

							<EidView
								t={t}
								centered
								csrfToken={req.csrfToken}
								url={initiativePath + "/signatures"}
								id="create-signature-view"
								action="sign"
								buttonClass="green-button"

								submit={
									t("initiative_page.signing_section.eid_view.sign_button")
								}

								pending={t("initiative_page.signing_section.eid_view.signing")}
								done={t("initiative_page.signing_section.eid_view.signed")}
							/>
					</>}
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
						<a href={serializeImageUrl(initiative, image)} class="image-link">
							<img src={serializeImageUrl(initiative, image)} />
						</a>

						{(
							image.author_name ||
							image.author_url ||
							imageEditable
						) ? <figcaption
							class={image.author_name || image.author_url ? "" : "empty"}
						>
							{image.author_name || image.author_url ? <>
								{t("INITIATIVE_IMAGE_AUTHOR_IS")}: {renderImageAuthor(image)}
							</> : Jsx.html(t("INITIATIVE_IMAGE_AUTHOR_EMPTY"))}
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

							{image.author_name || image.author_url ? <>
								<label
									class="link-button"
									for="initiative-image-author-toggle">
									{t("INITIATIVE_IMAGE_AUTHOR_EDIT")}
								</label>
								{", "}
							</> : null}

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
								maxlength={IMAGE_SCHEMA.properties.author_name.maxLength}
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
								maxlength={IMAGE_SCHEMA.properties.author_url.maxLength}
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

					{initiative.published_at ? <>
						<h3 class="sidebar-subheader">{t("SHARE_INITIATIVE")}</h3>

						<a
							href={"https://facebook.com/sharer/sharer.php?u=" + encode(initiativeUrl)}
							target="_blank"
							rel="external noopener"
							class="grey-button ra-icon-facebook-logo share-button">
							{t("SHARE_ON_FACEBOOK")}
						</a>

						<a
							href={"https://twitter.com/intent/tweet?text=" + encode(shareText)}
							target="_blank"
							rel="external noopener"
							class="grey-button ra-icon-twitter-logo share-button">
							{t("SHARE_ON_TWITTER")}
						</a>
					</> : null}
				</div>

				<SidebarAuthorView
					req={req}
					initiative={initiative}
					text={text}
					hasComments={comments.length > 0}
					translations={translations}
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

				<div id="initiative-disclaimer" class="sidebar-section">
					<p class="text">{Jsx.html(t("INITIATIVE_PAGE_DISCLAIMER"))}</p>
				</div>

				<SidebarPrintView
					initiative={initiative}
					events={events}
					comments={comments}
					t={t}
				/>

				<SidebarAdminView req={req} t={t} initiative={initiative} />
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

		<SignaturesTableView initiative={initiative} />
	</InitiativePage>
}

function PhasesView(attrs) {
  var {t} = attrs
  var {initiative} = attrs
  var sigs = attrs.signatureCount
	var {phase} = initiative
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
		DateFns.addMilliseconds(initiative.discussion_ends_at, -1),
		initiative.created_at
	) + 1 : 0

	var editProgress = Initiative.isPhaseGt(phase, "edit")
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

	var signProgress = Initiative.isPhaseGt(phase, "sign")
		? 1
		: sigs / getSignatureThreshold(initiative)

  var signPhaseText

	if (Initiative.isPhaseGte(phase, "sign")) {
		if (initiative.external)
			signPhaseText = t("N_SIGNATURES_EXTERNAL")
		else if (initiative.has_paper_signatures)
			signPhaseText = t("N_SIGNATURES_WITH_PAPER", {votes: sigs})
		else
			signPhaseText = t("N_SIGNATURES", {votes: sigs})
	}

	var parliamentProgress
  var parliamentPhaseText

	if (initiative.destination != "parliament");
	else if (
		Initiative.isPhaseGt(phase, "parliament") ||
		finishedInParliamentAt
	) {
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

		parliamentProgress = Initiative.isPhaseGt(phase, "parliament")
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
		Initiative.isPhaseGte(phase, "government") &&
		(phase == "government" || sentToGovernmentAt)
	) {
		governmentProgress = (
			Initiative.isPhaseGt(phase, "government") ||
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
	else if (
		initiative.destination != null &&
		initiative.destination != "parliament"
	) governmentProgress = 0

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

			{initiative.destination == "parliament" ? <li
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
      </li> : null}

			{governmentProgress != null ? <li
				id="government-phase"
				class={classifyPhase("government", phase)}
			>
				<i>{initiative.destination == "parliament"
					? t("GOVERNMENT_PHASE")
					: t("LOCAL_GOVERNMENT_PHASE")
				}</i>

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
	var {initiative} = attrs
	var {text} = attrs
	var initiativePath = "/initiatives/" + initiative.uuid
	var {files} = attrs

	if (initiative.external) {
		var pdf = (
			initiative.external_text_file_id &&
			files.find((file) => file.id == initiative.external_text_file_id) ||
			files.find((file) => file.content_type == "application/pdf")
		)

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
			return <article class="text" lang={text.language}>
				{Jsx.html(text.content)}
			</article>

		case "application/vnd.basecamp.trix+json":
			return <article class="text trix-text" lang={text.language}>
				{Trix.render(text.content, {heading: "h2"})}
			</article>

		case "application/vnd.citizenos.etherpad+html":
			var html = normalizeCitizenOsHtml(text.content)
			html = html.match(/<body>([^]*)<\/body>/m)[1]

			return <article class="text citizenos-text" lang={text.language}>
				{Jsx.html(html)}
			</article>

		default:
			throw new RangeError("Unsupported content type: " + text.content_type)
	}

	return null
}

function SidebarAuthorView(attrs) {
	var {req} = attrs
	var {user} = req
	var {initiative} = attrs
	var {translations} = attrs
	var isCreator = user && initiative.user_id == user.id

	var isAuthor = user && Initiative.isAuthor(user, initiative)
	if (!isAuthor) return null

	var {t} = req
	var {text} = attrs
	var signatureCount = initiative.signature_count
	var {hasComments} = attrs

	var initiativePath = "/initiatives/" + initiative.uuid
	var coauthorsPath = initiativePath + "/coauthors"

	var textEditPath = text && initiative.language != text.language
		? initiativePath + "/edit?language=" + text.language
		: initiativePath + "/edit"

	var hasEstonianText = initiative.language == "et" || translations.et
	var canPublish = Initiative.canPublish(user)

	var canSendToSign = (
		Initiative.canPropose(new Date, initiative, user) &&
		hasEstonianText
	)

	var actions = <>
		{initiative.phase == "edit" ? <>
			<Form
				req={req}
				id="initiative-destination-form"
				method="put"
				action={initiativePath}
			>
				<h3 class="sidebar-subheader">Algatuse saaja</h3>

				<InitiativeDestinationSelectView
					name="destination"
					initiative={initiative}
					placeholder="Vali Riigikogu või omavalitsus…"
					class="form-select"
					onchange="this.form.submit()"
				/>

				<noscript>
					<button type="submit" class="secondary-button">
						{t("INITIATIVE_PAGE_DESTINATION_UPDATE_BUTTON")}
					</button>
				</noscript>

				<p>{Jsx.html(t("INITIATIVE_PAGE_DESTINATION_UPDATE_DESCRIPTION", {
					email: _.escapeHtml(Config.helpEmail)
				}))}</p>
			</Form>
		</> : null}

		{!initiative.published_at && text ? <>
			<FormButton
				req={req}
				id="publish-button"
				action={initiativePath}
				name="visibility"
				value="public"
				disabled={!canPublish}
				class="green-button wide-button">
				{t("PUBLISH_TOPIC")}
			</FormButton>

			{user.email == null && user.unconfirmed_email == null ? <p>
				{Jsx.html(t("PUBLISH_INITIATIVE_SET_EMAIL", {userUrl: "/user"}))}
			</p> : user.email_confirmed_at == null ? <p>
				{Jsx.html(t("PUBLISH_INITIATIVE_CONFIRM_EMAIL"))}
			</p> : null}
		</> : null}

		{initiative.phase == "edit" && initiative.published_at ? <>
			<FormButton
				req={req}
				id="send-to-sign-button"
				action={initiativePath}
				name="status"
				value="voting"
				disabled={!canSendToSign}
				class="green-button wide-button">
				{t("BTN_SEND_TO_VOTE")}
			</FormButton>

			{!(
				new Date >= DateFns.addDays(
					DateFns.startOfDay(initiative.published_at),
					Config.minEditingDeadlineDays
				) ||

				initiative.tags.includes("fast-track")
			) ? <p>
				{t("INITIATIVE_SEND_TO_SIGNING_WAIT", {
					daysInEdit: Config.minEditingDeadlineDays,

					daysLeft: diffInDays(
						DateFns.addDays(
							DateFns.startOfDay(initiative.published_at),
							Config.minEditingDeadlineDays
						),

						new Date
					)
				})}
			</p> : !hasEstonianText ? <p>{Jsx.html(
				t("INITIATIVE_SEND_TO_SIGNING_NEEDS_ESTONIAN_TEXT", {
					newTextUrl: _.escapeHtml(initiativePath + "/texts/new?language=et")
				})
			)}</p> : null}

			{initiative.destination == null ? <p>
				{t("INITIATIVE_SEND_TO_SIGNING_NEEDS_DESTINATION")}
			</p> : null}
		</> : null}

		{(
			Initiative.canSendToParliament(initiative, user, signatureCount) ||
			Initiative.canSendToLocalGovernment(initiative, user, signatureCount)
		) ? <>
			<FormButton
				req={req}
				action={initiativePath}
				name="status"
				value="followUp"

				id={initiative.destination == "parliament"
					? "send-to-parliament-button"
					: "send-to-local-government-button"
				}

				disabled={!hasEstonianText}
				class="green-button wide-button"
			>
				{initiative.destination == "parliament"
					? t("SEND_TO_PARLIAMENT")
					: t("SEND_TO_LOCAL_GOVERNMENT")
				}
			</FormButton>

			{!hasEstonianText ? <p>{Jsx.html(
				t("INITIATIVE_SEND_TO_PARLIAMENT_NEEDS_ESTONIAN_TEXT", {
					newTextUrl: _.escapeHtml(initiativePath + "/texts/new?language=et")
				})
			)}</p> : null}
		</> : null}

		{initiative.phase == "edit" ? <a
			href={textEditPath}
			class="link-button wide-button">
			{t("EDIT_INITIATIVE_TEXT")}
		</a> : null}

		{initiative.phase == "sign" ? <a
			href={textEditPath}
			class="link-button wide-button">
			{t("EDIT_INITIATIVE_TRANSLATIONS")}
		</a> : null}

		{isCreator ? <a
			href={coauthorsPath}
			class="link-button wide-button">
			{t("EDIT_INITIATIVE_AUTHORS")}
		</a> : null}

		{initiative.phase == "edit" && initiative.published_at ? <FormButton
			req={req}
			action={initiativePath}
			name="visibility"
			value="public"
			class="link-button wide-button">
			{t("RENEW_DEADLINE")}
		</FormButton> : null}

		{Initiative.canUpdateSignDeadline(initiative, user) ? <FormButton
			req={req}
			action={initiativePath}
			name="status"
			value="voting"
			class="link-button wide-button">
			{t("RENEW_DEADLINE")}
		</FormButton> : null}

		{isAuthor && !isCreator ? <FormButton
			req={req}
			action={coauthorsPath + "/" + user.country + user.personal_id}
			name="_method"
			value="delete"
			onclick={confirm(t("INITIATIVE_COAUTHOR_DELETE_SELF_CONFIRMATION"))}
			class="link-button wide-button">
			{t("INITIATIVE_COAUTHOR_DELETE_SELF")}
		</FormButton> : null}

		{(
			isCreator &&
			initiative.phase == "edit" &&
			(!hasComments || !initiative.published_at)
		) ? <FormButton
			req={req}
			action={initiativePath}
			name="_method"
			value="delete"
			onclick={confirm(t("TXT_ALL_DISCUSSIONS_AND_VOTES_DELETED"))}
			class="link-button wide-button">
			{t("DELETE_DISCUSSION")}
		</FormButton> : null}
	</>

	if (!actions.some(Boolean)) return null

	return <div id="initiative-author-options" class="sidebar-section">
		<h2 class="sidebar-header">{t("INITIATIVE_EDIT_TITLE")} </h2>
		{actions}
	</div>
}

function SidebarInfoView(attrs) {
	var {req} = attrs
	var {t} = req
	var {user} = attrs
	var {initiative} = attrs
	var canEdit = user && Initiative.isAuthor(user, initiative)
	var {phase} = initiative
	var authorName = initiative.author_name
	var coauthorNames = _.map(initiative.coauthors, "user_name")
	var authorUrl = initiative.author_url
	var authorContacts = initiative.author_contacts
	var communityUrl = initiative.community_url
	var externalUrl = initiative.url
	var {organizations} = initiative
	var mediaUrls = initiative.media_urls
	var {meetings} = initiative
	var {notes} = initiative
	var governmentChangeUrls = initiative.government_change_urls
	var publicChangeUrls = initiative.public_change_urls
	var initiativePath = "/initiatives/" + initiative.uuid

	if (!(
		canEdit ||
		authorName ||
		coauthorNames.length > 0 ||
		authorUrl ||
		authorContacts ||
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
		action={initiativePath}>
		<input type="checkbox" id="initiative-info-form-toggle" hidden />

		<h2 class="sidebar-header">
			{canEdit ? <label
				class="edit-button link-button"
				for="initiative-info-form-toggle">
				{t("EDIT_INITIATIVE_INFO")}
			</label> : null}

			{t("INITIATIVE_INFO_TITLE")}
		</h2>

		{(
			authorName ||
			authorUrl ||
			authorContacts ||
			coauthorNames.length > 0 ||
			canEdit
		) ? <>
			<h3 class="sidebar-subheader">{t("INITIATIVE_INFO_AUTHOR_TITLE")}</h3>

			<div class="form-output">
				<ul>
					{authorName || authorUrl || authorContacts ? <li>
						<UntrustedLink href={authorUrl}>{authorName || null}</UntrustedLink>
					</li> : null}

					{(
						(authorName || authorUrl || coauthorNames.length) &&
						authorName != initiative.user_name
					) ? <li>{initiative.user_name}</li> : null}

					{coauthorNames.map((name) => <li>{name}</li>)}
				</ul>

				{authorContacts ? <p id="initiative-author-contacts">
					{Jsx.html(linkify(authorContacts))}
				</p> : null}
			</div>

			{canEdit ? <div class="form-fields">
				<h4 class="form-header">{t("INITIATIVE_INFO_AUTHOR_NAME_TITLE")}</h4>

				<input
					name="author_name"
					type="name"
					class="form-input"
					value={authorName}
					maxlength={SCHEMA.properties.author_name.maxLength}
				/>

				<p>{Jsx.html(t("INITIATIVE_INFO_AUTHOR_NAME_DESCRIPTION", {
					coauthorsUrl: _.escapeHtml(initiativePath + "/coauthors")
				}))}</p>
			</div> : null}

			{canEdit ? <div class="form-fields">
				<h4 class="form-header">{t("INITIATIVE_INFO_AUTHOR_URL_TITLE")}</h4>

				<input
					name="author_url"
					type="url"
					class="form-input"
					placeholder="https://"
					value={authorUrl}
					maxlength={SCHEMA.properties.author_url.maxLength}
				/>

				<p>{t("INITIATIVE_INFO_AUTHOR_URL_DESCRIPTION")}</p>
			</div> : null}

			{canEdit ? <div class="form-fields">
				<h4 class="form-header">{t("INITIATIVE_INFO_AUTHOR_CONTACTS_TITLE")}</h4>

				<textarea
					name="author_contacts"
					type="contacts"
					class="form-textarea"
					maxlength={SCHEMA.properties.author_contacts.maxLength}
				>
					{authorContacts}
				</textarea>

				<p>{t("INITIATIVE_INFO_AUTHOR_CONTACTS_DESCRIPTION")}</p>
			</div> : null}

			{authorName || authorUrl || authorContacts || coauthorNames.length > 0
				? null
				: <AddInitiativeInfoButton t={t} />
			}
		</> : null}

		{communityUrl || canEdit ? <InitiativeAttribute
			t={t}
			editable={canEdit}
			title={t("INITIATIVE_INFO_COMMUNITY_URL_TITLE")}
			help={t("INITIATIVE_INFO_COMMUNITY_URL_DESCRIPTION")}
			name="community_url"
			placeholder="https://"
			value={communityUrl}
			maxlength={SCHEMA.properties.community_url.maxLength}
		>
			<UntrustedLink class="form-output" href={communityUrl} />
		</InitiativeAttribute> : null}

		{organizations.length > 0 || canEdit ? <>
			<h3 class="sidebar-subheader">
				{t("INITIATIVE_INFO_ORGANIZATIONS_TITLE")}
			</h3>

			{organizations.length > 0 ? <ul class="form-output">
				{organizations.map((organization) => <li>
					<UntrustedLink href={organization.url}>
						{organization.name}
					</UntrustedLink>
				</li>)}
			</ul> : <AddInitiativeInfoButton t={t} />}

			{canEdit ? <InitiativeAttributeList
				id="initiative-organizations-form"
				add={t("INITIATIVE_INFO_ORGANIZATIONS_ADD")}
				help={t("INITIATIVE_INFO_ORGANIZATIONS_DESCRIPTION")}
				values={organizations}
				default={EMPTY_ORG}
			>{(organization, i) => <li>
				<input
					class="form-input"
					placeholder={t("INITIATIVE_INFO_ORGANIZATIONS_NAME_PLACEHOLDER")}
					name={`organizations[${i}][name]`}
					value={organization.name}
					maxlength={
						SCHEMA.properties.organizations.items.properties.name.maxLength
					}
				/>

				<input
					class="form-input"
					type="url"
					name={`organizations[${i}][url]`}
					value={organization.url}
					placeholder="https://"
					maxlength={
						SCHEMA.properties.organizations.items.properties.url.maxLength
					}
				/>
			</li>}</InitiativeAttributeList>: null}
		</> : null}

		{meetings.length > 0 || canEdit ? <>
			<h3 class="sidebar-subheader">
				{t("INITIATIVE_INFO_DISCUSSIONS_TITLE")}
			</h3>

			{meetings.length > 0 ? <ul class="form-output">
				{meetings.map((meeting) => <li>
					<UntrustedLink href={meeting.url}>
						{I18n.formatDate("numeric", Time.parseIsoDate(meeting.date))}
					</UntrustedLink>
				</li>)}
			</ul> : <AddInitiativeInfoButton t={t} />}

			{canEdit ? <InitiativeAttributeList
				id="initiative-meetings-form"
				add={t("INITIATIVE_INFO_DISCUSSIONS_ADD")}
				help={t("INITIATIVE_INFO_DISCUSSIONS_DESCRIPTION")}
				values={meetings}
				default={EMPTY_ORG}
			>{(meeting, i) => <li>
				<input
					class="form-input"
					type="date"
					placeholder={t("INITIATIVE_INFO_DISCUSSIONS_NAME_PLACEHOLDER")}
					name={`meetings[${i}][date]`}
					value={meeting.date}
				/>

				<input
					class="form-input"
					type="url"
					name={`meetings[${i}][url]`}
					value={meeting.url}
					placeholder="https://"
					maxlength={SCHEMA.properties.meetings.items.properties.url.maxLength}
				/>
			</li>}</InitiativeAttributeList>: null}
		</> : null}

		{Initiative.isPhaseGte(phase, "sign") ? <>
			{externalUrl || canEdit ? <InitiativeAttribute
				t={t}
				editable={canEdit}
				title={t("INITIATIVE_INFO_EXTERNAL_URL_TITLE")}
				name="url"
				type="url"
				placeholder="https://"
				maxlength={SCHEMA.properties.url.maxLength}
				value={externalUrl}
			>
				<UntrustedLink class="form-output" href={externalUrl} />
			</InitiativeAttribute> : null}
		</> : null}

		{Initiative.isPhaseGte(phase, "parliament") ? <>
			{mediaUrls.length > 0 || canEdit ? <>
				<h3 class="sidebar-subheader">
					{t("INITIATIVE_INFO_MEDIA_URLS_TITLE")}
				</h3>

				{mediaUrls.length > 0 ? <ul class="form-output">
					{mediaUrls.map((url) => <li>
						<UntrustedLink href={url}>{url}</UntrustedLink>
					</li>)}
				</ul> : <AddInitiativeInfoButton t={t} />}

				{canEdit ? <InitiativeAttributeList
					id="initiative-media-urls-form"
					add={t("INITIATIVE_INFO_MEDIA_URLS_ADD")}
					values={mediaUrls}
				>{(url, i) => <li>
					<input
						class="form-input"
						type="url"
						name={`media_urls[${i}]`}
						value={url}
						placeholder="https://"
						maxlength={SCHEMA.properties.media_urls.items.maxLength}
					/>
				</li>}</InitiativeAttributeList>: null}
			</> : null}
		</> : null}

		{Initiative.isPhaseGte(phase, "government") ? <>
			{mediaUrls.length > 0 || canEdit ? <>
				<h3 class="sidebar-subheader">
					{t("INITIATIVE_INFO_GOVERNMENT_CHANGE_URLS_TITLE")}
				</h3>

				{governmentChangeUrls.length > 0 ? <ul class="form-output">
					{governmentChangeUrls.map((url) => <li>
						<UntrustedLink href={url}>{url}</UntrustedLink>
					</li>)}
				</ul> : <AddInitiativeInfoButton t={t} />}

				{canEdit ? <InitiativeAttributeList
					id="initiative-government-change-urls-form"
					add={t("INITIATIVE_INFO_GOVERNMENT_CHANGE_URLS_ADD")}
					help={t("INITIATIVE_INFO_GOVERNMENT_CHANGE_URLS_DESCRIPTION")}
					values={governmentChangeUrls}
				>{(url, i) => <li>
					<input
						class="form-input"
						type="url"
						name={`government_change_urls[${i}]`}
						value={url}
						placeholder="https://"
						maxlength={SCHEMA.properties.government_change_urls.items.maxLength}
					/>
				</li>}</InitiativeAttributeList>: null}
			</> : null}
		</> : null}

		{Initiative.isPhaseGte(phase, "done") ? <>
			{mediaUrls.length > 0 || canEdit ? <>
				<h3 class="sidebar-subheader">
					{t("INITIATIVE_INFO_PUBLIC_CHANGE_URLS_TITLE")}
				</h3>

				{publicChangeUrls.length > 0 ? <ul class="form-output">
					{publicChangeUrls.map((url) => <li>
						<UntrustedLink href={url}>{url}</UntrustedLink>
					</li>)}
				</ul> : <AddInitiativeInfoButton t={t} />}

				{canEdit ? <InitiativeAttributeList
					id="initiative-public-change-urls-form"
					add={t("INITIATIVE_INFO_PUBLIC_CHANGE_URLS_ADD")}
					help={t("INITIATIVE_INFO_PUBLIC_CHANGE_URLS_DESCRIPTION")}
					values={publicChangeUrls}
				>{(url, i) => <li>
					<input
						class="form-input"
						type="url"
						name={`public_change_urls[${i}]`}
						value={url}
						placeholder="https://"
						maxlength={SCHEMA.properties.public_change_urls.items.maxLength}
					/>
				</li>}</InitiativeAttributeList>: null}
			</> : null}
		</> : null}

		{initiative.notes || canEdit ? <InitiativeAttribute
			t={t}
			editable={canEdit}
			type="textarea"
			title={t("NOTES_HEADER")}
			name="notes"
			value={initiative.notes}
			maxlength={SCHEMA.properties.notes.maxLength}
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
	var {req} = attrs
	var {t} = req
	var {initiative} = attrs
	var {subscriberCounts} = attrs
	var atomPath = req.baseUrl + req.path + ".atom"

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

function SidebarPrintView({t, initiative, events, comments}) {
	return <details class="sidebar-section" id="initiative-print" hidden>
		<summary class="sidebar-header">
			{t("initiative_page.sidebar.print.title")}
		</summary>

		<form id="initiative-print-settings-form">
			<label>
				<input
					type="checkbox"
					name="text"
					checked={!initiative.external}
					disabled={initiative.external}
				/>

				<span>{t("initiative_page.sidebar.print.text_label")}</span>
			</label>

			<label>
				<input
					type="checkbox"
					name="events"
					checked={events.length > 0}
					disabled={events.length == 0}
				/>

				<span>{t("initiative_page.sidebar.print.events_label")}</span>
			</label>

			<label>
				<input
					type="checkbox"
					name="comments"
					checked={comments.length > 0}
					disabled={comments.length == 0}
				/>

				<span>{t("initiative_page.sidebar.print.comments_label")}</span>
			</label>

			<label>
				<input type="checkbox" name="signatures-table" />
				<span>{t("initiative_page.sidebar.print.signatures_table_label")}</span>
			</label>

			<button type="submit" class="secondary-button">
				{t("initiative_page.sidebar.print.print_button")}
			</button>
		</form>

		{/* TODO: Ensure a polyfill for Element.prototype.classList exists. */}
		<script>{javascript`
			document.querySelector("#initiative-print").hidden = false
			var form = document.querySelector("#initiative-print-settings-form")
			var each = Function.call.bind(Array.prototype.forEach)

			form.addEventListener("submit", function(ev) {
				ev.preventDefault()
				window.print()
			})

			form.addEventListener("change", function(ev) { setPrinting(ev.target) })

			// When you refresh the page, browsers tend to restore the checkboxes as
			// they last were
			each(form.elements, function(el) {
				if (el.tagName == "INPUT") setPrinting(el)
			})

			function setPrinting(input) {
				document.body.classList.toggle(
					"disable-printing-" + input.name,
					!input.checked
				)
			}
		`}</script>
	</details>
}

function SidebarAdminView({req, t, initiative}) {
	if (!(req.user && isAdmin(req.user))) return null

	return <div class="sidebar-section">
		<h2 class="sidebar-header">
			{t("initiative_page.sidebar.admin.title")}
		</h2>

		<a
			href={`${Config.adminUrl}/initiatives/${initiative.uuid}`}
			class="link-button wide-button"
		>
			{t("initiative_page.sidebar.admin.edit_button")}
		</a>
	</div>
}

function EventsView(attrs) {
	var {t} = attrs
	var {user} = attrs
	var {initiative} = attrs
	var events = attrs.events.sort(compareEvent).reverse()
	var initiativePath = "/initiatives/" + initiative.uuid

	var canCreateEvents = (
		user &&
		Initiative.isAuthor(user, initiative) &&
		initiative.archived_at == null &&
		initiative.phase != "edit"
	)

	if (events.length > 0 || canCreateEvents)
		return <section id="initiative-events" class="transparent-section"><center>
			<a name="events" />
			<h2>{t("initiative_page.events.title")}</h2>

			<article class="initiative-sheet">
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
					var meeting
					var links
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

							var {committee} = event.content
							if (committee) content = <p class="text">
								{t("PARLIAMENT_ACCEPTED_SENT_TO_COMMITTEE", {
									committee: committee
								})}
							</p>
							break

						case "parliament-board-meeting":
							title = t("PARLIAMENT_BOARD_MEETING")
							break

						case "parliament-plenary-meeting":
							title = t("PARLIAMENT_PLENARY_MEETING")
							meeting = event.content
							summary = meeting.summary
							links = meeting.links || EMPTY_ARR

							content = <>
								{summary ? <p class="text">
									{Jsx.html(linkify(summary))}
								</p> : null}

								{links.length ? <ul class="event-links">
									{links.map((link) => <li>
										<UntrustedLink href={link.url}>{link.title}</UntrustedLink>
									</li>)}
								</ul> : null}
							</>
							break

						case "parliament-committee-meeting":
							meeting = event.content
							decision = meeting.decision
							var {invitees} = meeting
							summary = meeting.summary
							links = meeting.links || EMPTY_ARR

							title = meeting.committee
								? t("PARLIAMENT_COMMITTEE_MEETING_BY", {
									committee: meeting.committee
								})
								: t("PARLIAMENT_COMMITTEE_MEETING")

							content = <>
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
									: decision == "hold-public-hearing"
									? t("PARLIAMENT_MEETING_DECISION_HOLD_PUBLIC_HEARING")
									: decision == "reject"
									? t("PARLIAMENT_MEETING_DECISION_REJECT")
									: decision == "forward"
									? t("PARLIAMENT_MEETING_DECISION_FORWARD")
									: decision == "forward-to-government"
									? t("PARLIAMENT_MEETING_DECISION_FORWARD_TO_GOVERNMENT")
									: decision == "solve-differently"
									? t("PARLIAMENT_MEETING_DECISION_SOLVE_DIFFERENTLY")
									: decision == "draft-act-or-national-matter"
									? t("PARLIAMENT_MEETING_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
									: null
								}</p> : null}

								{links.length ? <ul class="event-links">
									{links.map((link) => <li>
										<UntrustedLink href={link.url}>{link.title}</UntrustedLink>
									</li>)}
								</ul> : null}
							</>
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

							content = <>
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
							</>
							break

						case "parliament-interpellation":
							title = t("PARLIAMENT_INTERPELLATION")
							var interpellation = event.content
							var deadline = Time.parseIsoDate(interpellation.deadline)

							content = <>
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
							</>
							break

						case "parliament-national-matter":
							title = t("PARLIAMENT_NATIONAL_MATTER")
							break

						case "parliament-finished":
							decision = initiative.parliament_decision
							title = t("PARLIAMENT_FINISHED")

							if (decision) content = <p class="text">{
								decision == "return"
								? t("PARLIAMENT_DECISION_RETURN")
								: decision == "reject"
								? t("PARLIAMENT_DECISION_REJECT")
								: decision == "forward"
								? t("PARLIAMENT_DECISION_FORWARD")
								: decision == "forward-to-government"
								? t("PARLIAMENT_DECISION_FORWARD_TO_GOVERNMENT")
								: decision == "solve-differently"
								? t("PARLIAMENT_DECISION_SOLVE_DIFFERENTLY")
								: decision == "draft-act-or-national-matter"
								? t("PARLIAMENT_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
								: null
								}</p>
							break

						case "sent-to-government":
							title = initiative.destination != "parliament"
								? t("EVENT_SENT_TO_LOCAL_GOVERNMENT_TITLE")
								: initiative.government_agency
								? t("EVENT_SENT_TO_GOVERNMENT_TITLE_WITH_AGENCY", {
									agency: initiative.government_agency
								})
								: t("EVENT_SENT_TO_GOVERNMENT_TITLE")
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

						case "media-coverage":
							title = <UntrustedLink href={event.content.url}>
								{event.title}
							</UntrustedLink>

							authorName = event.content.publisher
							content = null
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
						<h3>{title}</h3>

						<div class="metadata">
							<time class="occurred-at" datetime={event.occurred_at.toJSON()}>
								<a href={`#event-${event.id}`}>
									{I18n.formatDate("numeric", event.occurred_at)}
								</a>
							</time>

							{authorName ? <>
								{", "}
								<span class="author">{authorName}</span>
							</> : null}
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
                isotime: _.escapeHtml(event.created_at.toJSON()),
                date: _.escapeHtml(I18n.formatDate("numeric", event.created_at))
              }))}
            </p> : null}
					</li>
				})}</ol>
			</article>
		</center></section>

	else if (Initiative.isPhaseGte(initiative, "parliament"))
		return <section id="initiative-events" class="transparent-section"><center>
			<article><p class="text empty">{t("NO_GOVERNMENT_REPLY")}</p></article>
		</center></section>

	else return null
}

function CommentsView(attrs) {
	var {t} = attrs
	var {req} = attrs
	var {initiative} = attrs
	var {comments} = attrs
	var {subscription} = attrs

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
			id="comment-form"
			initiative={initiative}
			subscription={subscription}
			referrer={req.baseUrl + req.path}
		/>
	</center></section>
}

function SignaturesTableView({initiative}) {
	return <section id="signatures-table-section">
		<table>
			<caption>
				Olen lugenud läbi algatuse "{initiative.title}" ja avaldan toetust oma allkirjaga.
			</caption>

			<thead><tr>
				<th class="name-column">Nimi</th>
				<th class="personal-id-column">Isikukood</th>
				<th class="signature-column">Allkiri</th>
			</tr></thead>

			<tbody>{_.fill(new Array(20), <tr>
				<td class="name-column" />
				<td class="personal-id-column" />
				<td class="signature-id-column" />
			</tr>)}</tbody>
		</table>
	</section>
}

function SubscribeEmailView(attrs) {
	var {t} = attrs
	var {req} = attrs
	var {user} = req
	var {initiative} = attrs
	var {count} = attrs
	var {allCount} = attrs
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
	var {t} = attrs
	var {initiative} = attrs
	var {signatureCount} = attrs

	switch (initiative.phase) {
		case "edit":
			return <p class="initiative-progress-text">
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

		case "sign":
			var signatureThreshold = getSignatureThreshold(initiative)
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

function QuicksignView(attrs) {
	var {t} = attrs
	var {req} = attrs
	var {initiative} = attrs
	var {signature} = attrs
	var {signatureCount} = attrs

	if (!initiative.published_at) return null

	return <div class={"quicksign " + (attrs.class || "")}>
		<ProgressView
			t={t}
			initiative={initiative}
			signatureCount={signatureCount}
		/>

		{Initiative.isSignable(new Date, initiative) && !signature ? <a
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

		{Initiative.isSignable(new Date, initiative) && signature ? <>
			<h2>{t("THANKS_FOR_SIGNING")}</h2>

			<DownloadSignatureButton signature={signature}>
				{t("DOWNLOAD_SIGNATURE")}
			</DownloadSignatureButton>

			<span class="form-or">{t("FORM_OR")}</span>

			<DeleteSignatureButton req={req} signature={signature}>
				{t("REVOKE_SIGNATURE")}
			</DeleteSignatureButton>
		</> : null}
	</div>
}

function InitiativeDestinationSelectView(attrs) {
	var {initiative} = attrs
	var dest = initiative.destination
	var {placeholder} = attrs

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
			<optgroup label={county + " maakond"}>{govs.map(([id, {name}]) => (
				<option value={id} selected={dest == id}>{name}</option>
			))}</optgroup>
		))}
	</select>
}

function InitiativeLocationView(attrs) {
	var {t} = attrs
	var {initiative} = attrs

	var content
	if (initiative.phase == "parliament" && initiative.parliament_committee) {
		content = <>
			{Jsx.html(t("INITIATIVE_IS_IN_PARLIAMENT_COMMITTEE", {
				committee: _.escapeHtml(initiative.parliament_committee)
			}))}
		</>
	}
	else if (initiative.phase == "government" && initiative.government_agency) {
		content = <>
			{Jsx.html(t("INITIATIVE_IS_IN_GOVERNMENT_AGENCY", {
				agency: _.escapeHtml(initiative.government_agency)
			}))}<br />

			{initiative.government_contact ? <>
				<br />
				<strong>{t("GOVERNMENT_AGENCY_CONTACT")}</strong>:<br />
				{initiative.government_contact}<br />
				{Jsx.html(linkify(initiative.government_contact_details || ""))}
			</> : null}
		</>
	}

	if (content == null) return null
	else return <p id="initiative-location">{content}</p>
}

function InitiativeAttribute(attrs, children) {
	var {t} = attrs
	var {title} = attrs
	var {type} = attrs
	var {name} = attrs
	var {value} = attrs
	var {placeholder} = attrs
	var {help} = attrs
	var {editable} = attrs
	var {maxlength} = attrs

	return <>
		<h3 class="sidebar-subheader">{title}</h3>
		{value ? children : <AddInitiativeInfoButton t={t} /> }

		{editable ? <div class="form-fields">
			{type == "textarea" ? <textarea
				name={name}
				class="form-textarea"
				maxlength={maxlength}
				placeholder={placeholder}>
				{value}
			</textarea> : <input
				name={name}
				type={type}
				class="form-input"
				placeholder={placeholder}
				value={value}
				maxlength={maxlength}
			/>}

			{help ? <p>{help}</p> : null}
		</div> : null}
	</>
}

function InitiativeAttributeList(attrs, children) {
	var {id} = attrs
	var {values} = attrs
	var def = attrs.default
	var {add} = attrs
	var {help} = attrs
	var render = children[0]
	var buttonId = _.uniqueId("initiative-attributes-")

	return <div id={id} class="form-fields">
		{help ? <p>{help}</p> : null}

		<ol class="form-list">
			{(values.length > 0 ? values : [def]).map(render)}
		</ol>

		<button type="button" id={buttonId}>{add}</button>

		<script>{javascript`
			var button = document.getElementById(${buttonId})
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
	var {href} = attrs
	var klass = attrs.class || ""
	children = children ? children.filter(Boolean) : EMPTY_ARR
	var text = children.length ? children : href

	if (HTTP_URL.test(href)) return <a {...attrs} class={klass + " link-button"}>
		{text}
	</a>
	else return <span class={klass}>{text}</span>
}

function InitiativeImageUploadForm(attrs, children) {
	var {req} = attrs
	var {initiative} = attrs
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
				accept="image/jpeg, image/png"
				onchange="this.form.submit()"
			/>

			{children}
		</label>
	</Form>
}

function AddInitiativeInfoButton(attrs) {
	var {t} = attrs

	return <label
		class="edit-button link-button"
		for="initiative-info-form-toggle">
		{t("ADD_INITIATIVE_INFO")}
	</label>
}

function DownloadSignatureButton(attrs, children) {
	var {signature} = attrs
	var initiativePath = "/initiatives/" + signature.initiative_uuid
	var signaturePath = initiativePath + "/signatures/"
	signaturePath += pathToSignature(signature, "asice")

	return <a class="link-button download-button" href={signaturePath} download>
		{children}
	</a>
}

function DeleteSignatureButton(attrs, children) {
	var {req} = attrs
	var {signature} = attrs
	var initiativePath = "/initiatives/" + signature.initiative_uuid

	return <FormButton
		req={req}
		formClass="revoke-button"
		class="link-button"
		action={initiativePath + "/signatures/" + pathToSignature(signature)}
		onclick={confirm(req.t("REVOKE_SIGNATURE_CONFIRMATION"))}
		name="_method"
		value="delete">
		{children}
	</FormButton>
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
		case "parliament-plenary-meeting":
		case "parliament-decision":
		case "parliament-finished": return "parliament"
		case "sent-to-government": return "government"
		case "finished-in-government": return "government"
		case "text":
		case "media-coverage": return null
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

/** @jsx Jsx */
var _ = require("root/lib/underscore")
var O = require("oolong")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var DateFns = require("date-fns")
var InitiativePage = require("./initiative_page")
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var Flash = require("../page").Flash
var Initiative = require("root/lib/initiative")
var Comment = require("root/lib/comment")
var ProgressView = require("./initiative_page").ProgressView
var Form = require("../page").Form
var FormButton = require("../page").FormButton
var DonateForm = require("../donations/create_page").DonateForm
var javascript = require("root/lib/jsx").javascript
var confirm = require("root/lib/jsx").confirm
var stringify = require("root/lib/json").stringify
var linkify = require("root/lib/linkify")
var encode = encodeURIComponent
var HTTP_URL = /^https?:\/\//i
var EMPTY_ORG = {name: "", url: ""}
var EVENT_NOTIFICATIONS_SINCE = new Date(Config.eventNotificationsSince)
exports = module.exports = ReadPage
exports.CommentView = CommentView

var UI_TRANSLATIONS = O.map(I18n.STRINGS, function(lang) {
	return O.filter(lang, (_value, key) => key.indexOf("HWCRYPTO") >= 0)
})

function ReadPage(attrs) {
	var req = attrs.req
	var t = attrs.t
  var lang = req.lang
	var signature = attrs.signature
	var comment = attrs.comment
	var comments = attrs.comments
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

		<section id="initiative-section" class="transparent-section"><center>
			<div id="initiative-sheet">
				<Flash flash={flash} />

				{flash("signed") ? <div class="initiative-status">
          <h1 class="status-serif-header">{t("THANKS_FOR_SIGNING")}</h1>

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

				<article class="text">{Jsx.html(initiative.html)}</article>

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
			flash={flash}
			initiative={initiative}
			comment={comment}
			comments={comments}
		/>
	</InitiativePage>
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
	var authorUrl = dbInitiative.author_url
	var communityUrl = dbInitiative.community_url
	var externalUrl = dbInitiative.url
	var organizations = dbInitiative.organizations
	var mediaUrls = dbInitiative.media_urls
	var meetings = dbInitiative.meetings
	var notes = dbInitiative.notes

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
						{meeting.date}
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

		{initiative.vote ? <Fragment>
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

		{Initiative.isInParliament(initiative, dbInitiative) ? <Fragment>
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

	if (events.length > 0 || Initiative.canCreateEvents(initiative))
		return <section id="initiative-events" class="transparent-section"><center>
			{Initiative.canCreateEvents(initiative) ? <a
				href={`/initiatives/${initiative.id}/events/new`}
				class="create-event-button">
				{t("CREATE_INITIATIVE_EVENT_BUTTON")}
			</a> : null}

			<article>
        <ol class="events">{events.map(function(event) {
          // No point in showing delay warnings for events that were created
          // before we started notifying people of new events.
          var delay = +event.created_at >= +EVENT_NOTIFICATIONS_SINCE
            ? DateFns.differenceInCalendarDays(
              event.occurred_at,
              event.created_at
            ) : 0

          return <li class="event">
						<time class="occurred-at" datetime={event.occurred_at.toJSON()}>
							{I18n.formatDate("numeric", event.occurred_at)}
						</time>

						<h2>{event.title}</h2>
						<p class="text">{Jsx.html(linkify(event.text))}</p>

            {delay != 0 ? <p class="delay">
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
	var flash = attrs.flash
	var initiative = attrs.initiative
	var comment = attrs.comment
	var comments = attrs.comments
	var editedComment = comment
	var commentsUrl = `/initiatives/${initiative.id}/comments`

	return <section id="initiative-comments" class="transparent-section"><center>
		<h2>{t("COMMENT_HEADING")}</h2>

		{flash("commentError") ?
			<p class="flash error">{flash("commentError")}</p>
		: null}

		<ol class="comments">
			{comments.map((comment) => <li
				id={`comment-${comment.id}`}
				class="comment">
				<CommentView
					req={req}
					initiative={initiative}
					comment={comment}
					editedComment={editedComment}
				/>
			</li>)}
		</ol>

		{
			// Comment form anchor used for redirecting to error.
		}
		<Form
			req={req}
			id="initiative-comment-form"
			method="post"
			action={commentsUrl}
			class="comment-form">
			<input
				name="subject"
				value={editedComment.parentId == null ? editedComment.subject : null}
				maxlength={128}
				required
				placeholder={t("COMMENT_TITLE_PLACEHOLDER")}
				disabled={!req.user}
				class="form-input"
			/>

			<textarea
				name="text"
				maxlength={2048}
				required
				placeholder={t("COMMENT_BODY_PLACEHOLDER")}
				disabled={!req.user}
				class="form-textarea">
				{editedComment.parentId == null ? editedComment.text : null}
			</textarea>
			<button disabled={!req.user} class="secondary-button">{t("POST_COMMENT")}</button>

			{!req.user ? <span class="text signin-to-act">
				{Jsx.html(t("TXT_TOPIC_COMMENT_LOG_IN_TO_PARTICIPATE", {
					url: "/session/new"
				}))}
			</span> : null}
		</Form>
	</center></section>
}

function CommentView(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var comment = attrs.comment
	var editedComment = attrs.editedComment

	var name = comment.creator.name
	var isEdited = editedComment.parentId === comment.id
	var commentUrl = `/initiatives/${initiative.id}/comments/${comment.id}`

	return <Fragment>
		<span class="author">{name}</span>
		{" "}
		<time datetime={comment.createdAt}>
			<a href={commentUrl}>
				{I18n.formatDateTime("numeric", comment.createdAt)}
			</a>
		</time>

		<h3 class="subject"><a href={commentUrl}>{comment.subject}</a></h3>
		<p class="text">{Jsx.html(Comment.htmlify(comment.text))}</p>

		{req.user ? <a
			href={`#comment-${comment.id}-reply`}
			class="comment-reply-button white-button">
			{t("REPLY")}
		</a> : null}

		<ol class="comment-replies">{comment.replies.map((reply) => <li
			id={`comment-${reply.id}`}
			class={["comment-reply", Initiative.isCommentShort(reply) ? "short" : ""].join(" ")}>

			<span class="author">{reply.creator.name}</span>
			{" "}
			<time datetime={reply.createdAt}>
				<a href={commentUrl + `#comment-${reply.id}`}>
					{I18n.formatDateTime("numeric", reply.createdAt)}
				</a>
			</time>

			<p class="text">{Jsx.html(Comment.htmlify(reply.text))}</p>
		</li>)} </ol>

		{req.user ? <Form
			req={req}
			id={`comment-${comment.id}-reply`}
			method="post"
			action={commentUrl + "/replies"}
			hidden={!isEdited}
			class="comment-reply-form">
			<textarea
				name="text"
				maxlength={2048}
				required
				placeholder={t("PLACEHOLDER_ADD_YOUR_REPLY", {name: name})}
				class="form-textarea">
				{isEdited ? editedComment.text : null}
			</textarea>
			<button class="secondary-button">{t("POST_REPLY")}</button>
		</Form> : null}
	</Fragment>
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

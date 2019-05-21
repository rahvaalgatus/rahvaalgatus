/** @jsx Jsx */
var _ = require("lodash")
var O = require("oolong")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
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
exports = module.exports = ReadPage
exports.CommentView = CommentView

var UI_TRANSLATIONS = O.map(I18n.STRINGS, function(lang) {
	return O.filter(lang, (_value, key) => key.indexOf("HWCRYPTO") >= 0)
})

function ReadPage(attrs) {
	var req = attrs.req
	var t = attrs.t
	var signature = attrs.signature
	var comment = attrs.comment
	var comments = attrs.comments
	var flash = attrs.flash
	var events = attrs.events
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative

	var now = new Date
	var opt = signature ? "No" : "Yes"
	var optId = initiative.vote && Initiative.findOptionId(opt, initiative)
	var sentToParliamentAt = dbInitiative.sent_to_parliament_at

	var signWithIdCardText = !signature
		? t("BTN_VOTE_SIGN_WITH_ID_CARD")
		: t("BTN_VOTE_REVOKE_WITH_ID_CARD")

	var signWithMobileClass = signature ? "white-button" : "primary-button"
	var signWithMobileText = !signature
		? t("BTN_VOTE_SIGN_WITH_MOBILE_ID")
		: t("BTN_VOTE_REVOKE_WITH_MOBILE_ID")

	var shareUrl = `${Config.url}/initiatives/${initiative.id}`
	var shareText = `${initiative.title} ${shareUrl}`

	return <InitiativePage
		page="initiative"
		title={initiative.title}
		initiative={initiative}

		meta={{
			"og:title": initiative.title,
			"og:url": `${Config.url}/initiatives/${initiative.id}`
		}}

		req={req}>
		<script src="/assets/html5.js" />
		<script src="/assets/hwcrypto.js" />

		<section id="initiative-section" class="transparent-section"><center>
			<div id="initiative-sheet">
				<Flash flash={flash} />

				{flash("signed") ? <div class="initiative-status">
					{Jsx.html(t("SUPPORT_US_CONTENT"))}
					<DonateForm req={req} t={t} />
				</div> : null}

				{(function($value) {
					var sigs

					switch ($value) {
						case "inProgress":
							if (
								Initiative.isPublic(initiative) &&
								!Initiative.hasDiscussionEnded(new Date, initiative)
							) return <div class="initiative-status">
								<h1>
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
									{events.length == 0 ? [
										(Initiative.isSuccessful(initiative)) ? [
											<h1>{t("N_SIGNATURES_COLLECTED", {votes: sigs})}</h1>,
											<p>{t("VOTING_SUCCEEDED")}</p>
										] : [
											<h1>{t("N_SIGNATURES_FAILED", {votes: sigs})}</h1>,
											<p>{t("VOTING_FAILED")}</p>
										]
									] : null}
								</div>
							}
							else return null

						case "followUp": return <div class="initiative-status">
							<h1>
								{t("INITIATIVE_IN_PARLIAMENT")}
								{" "}
								<a href="#initiative-events" class="link-button wide-button">
									{t("LOOK_AT_EVENTS")}
								</a>.
							</h1>
						</div>

						case "closed":
							if (Initiative.isInParliament(initiative) || sentToParliamentAt) {
								return <div class="initiative-status">
									<h1>
										{t("INITIATIVE_PROCESSED")}
										{" "}
										<a
											href="#initiative-events"
											class="link-button wide-button">
											{t("LOOK_AT_EVENTS")}
										</a>.
									</h1>
								</div>
							}
							else if (initiative.vote) {
								sigs = Initiative.countSignatures("Yes", initiative)

								return <div class="initiative-status">
									<h1>{t("N_SIGNATURES_FAILED", {votes: sigs})}</h1>
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

					<ProgressTextView initiative={initiative} t={t} />

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
				<QuicksignView
					req={req}
					t={t}
					initiative={initiative}
					dbInitiative={dbInitiative}
					signature={signature}
				/>

				{Initiative.canPublish(initiative) ? <Form
					req={req}
					method="put"
					action={"/initiatives/" + initiative.id}>
					<button
						name="visibility"
						value="public"
						class="primary-button wide-button">
						{t("PUBLISH_TOPIC")}
					</button>
				</Form> : null}

				{Initiative.canPropose(new Date, initiative) ? <Form
					req={req}
					method="put"
					action={"/initiatives/" + initiative.id}>
					<button
						name="status"
						value="voting"
						class="primary-button wide-button">
						{t("BTN_SEND_TO_VOTE")}
					</button>
				</Form> : null}

				{Initiative.canSendToParliament(initiative) ? <Form
					req={req}
					method="put"
					action={"/initiatives/" + initiative.id}>
					<button
						name="status"
						value="followUp"
						class="primary-button wide-button">
						{t("SEND_TO_PARLIAMENT")}
					</button>
				</Form> : null}

				{Initiative.canEdit(initiative) ? <a
					href={"/initiatives/" + initiative.id + "/edit"}
					class="link-button wide-button">
					{t("EDIT_INITIATIVE")}
				</a> : null}

				{dbInitiative.notes ? <div id="initiative-notes">
					<h2>{t("NOTES_HEADER")}</h2>
					<p class="text">{Jsx.html(linkify(dbInitiative.notes))}</p>
				</div> : null}

				<InitiativeSubscribeView req={req} initiative={initiative} t={t} />

				{Initiative.isPublic(initiative) ? <Fragment>
					<a
						href={"https://facebook.com/sharer/sharer.php?u=" + encode(shareUrl)}
						target="_blank"
						class="link-button wide-button share-button">
						{t("SHARE_ON_FACEBOOK")}
					</a>

					<a
						href={"https://twitter.com/intent/tweet?status=" + encode(shareText)}
						target="_blank"
						class="link-button wide-button share-button">
						{t("SHARE_ON_TWITTER")}
					</a>
				</Fragment> : null}
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

function EventsView(attrs) {
	var t = attrs.t
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative
	var events = attrs.events
	var sentToParliamentAt = dbInitiative.sent_to_parliament_at
	var finishedInParliamentAt = dbInitiative.finished_in_parliament_at

	if (!(
		Initiative.isInParliament(initiative) ||
		sentToParliamentAt ||
		finishedInParliamentAt)
	) return null
		
	return <section id="initiative-events" class="transparent-section"><center>
		<article>
			{events.length == 0 && sentToParliamentAt == null
				? <p class="text empty">{t("NO_EVENTS")}</p>
				: <ol class="events">

				{finishedInParliamentAt ? <li class="event">
					<time datetime={finishedInParliamentAt.toJSON()}>
						{I18n.formatDate("numeric", finishedInParliamentAt)}
					</time>
					<h2>{t("PROCEEDING_FINISHED_TITLE")}</h2>
					<p class="text">{t("PROCEEDING_FINISHED_BODY")}</p>
				</li> : null}

				{events.map(function(event) {
					return <li class="event">
						<time datetime={event.createdAt.toJSON()}>
							{I18n.formatDate("numeric", event.createdAt)}
						</time>

						<h2>{event.title}</h2>
						<p class="text">{Jsx.html(linkify(event.text))}</p>
					</li>
				})}

				{sentToParliamentAt ? <li class="event">
					<time datetime={sentToParliamentAt.toJSON()}>
						{I18n.formatDate("numeric", sentToParliamentAt)}
					</time>

					<h2>{t("FIRST_PROCEEDING_TITLE")}</h2>
					<p class="text">{t("FIRST_PROCEEDING_BODY")}</p>
				</li> : null}
			</ol>}
		</article>
	</center></section>
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
				{I18n.formatTime("numeric", comment.createdAt)}
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
					{I18n.formatTime("numeric", reply.createdAt)}
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

function InitiativeSubscribeView(attrs) {
	var t = attrs.t
	var req = attrs.req
	var initiative = attrs.initiative

	if (!Initiative.isPublic(initiative)) return null

	return <Form
		req={req}
		id="initiative-subscribe"
		method="post"
		action={"/initiatives/" + initiative.id + "/subscriptions"}>
		<h3>{t("WANT_TO_KEEP_INFORMED_ABOUT_FURTHER_PROGRESS")}</h3>

		<input
			id="initiative-subscribe-email"
			name="email"
			type="email"
			required
			placeholder={t("LBL_EMAIL")}
			class="form-input"
		/>

		<button type="submit" class="secondary-button">{t("BTN_SUBSCRIBE")}</button>
	</Form>
}

function ProgressTextView(attrs) {
	var t = attrs.t
	var initiative = attrs.initiative

	if (
		initiative.status == "voting" ||
		initiative.status == "closed" &&
		initiative.vote && !Initiative.isInParliament(initiative)
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
					{I18n.formatTime("numeric", initiative.vote.endsAt)}
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
					{I18n.formatTime("numeric", initiative.endsAt)}
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
	var id = _.uniqueId("quicksign")
	var now = new Date

	return <div class="quicksign">
		<ProgressView t={t} initiative={initiative} dbInitiative={dbInitiative} />

		{Initiative.isVotable(now, initiative) && !signature ? <a
			href="#initiative-vote"
			class="primary-button wide-button sign-button">
			{t("SIGN_THIS_DOCUMENT")}
			</a>
		: null}

		<ProgressTextView initiative={initiative} t={t} />

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

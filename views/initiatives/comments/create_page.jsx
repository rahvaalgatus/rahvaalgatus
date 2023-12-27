/** @jsx Jsx */
var Jsx = require("j6pack")
var InitiativePage = require("../initiative_page")
var {Flash} = require("../../page")
var {Form} = require("../../page")
var CommentsController =
	require("root/controllers/initiatives/comments_controller")
var {isAdmin} = require("root/lib/user")
var MAX_COMMENT_TITLE_LENGTH = CommentsController.MAX_TITLE_LENGTH
var MAX_COMMENT_TEXT_LENGTH = CommentsController.MAX_TEXT_LENGTH
exports = module.exports = CreatePage
exports.CommentForm = CommentForm
exports.PersonaInput = PersonaInput

function CreatePage(attrs) {
	var {req} = attrs
	var {t} = req
	var {initiative} = attrs
	var {referrer} = attrs
	var {newComment} = attrs

	return <InitiativePage
		page="initiative-comment"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<section id="initiative-comment" class="primary-section">
			<center>
				<h2>{t("COMMENT_HEADING")}</h2>
				<Flash flash={req.flash} />

				<CommentForm
					id="comment-form"
					req={req}
					initiative={initiative}
					referrer={referrer}
					newComment={newComment}
				/>
			</center>
		</section>
	</InitiativePage>
}

function CommentForm(attrs) {
	var {req} = attrs
	var {t} = req
	var {user} = req
	var {initiative} = attrs
	var {newComment} = attrs
	var {referrer} = attrs
	var {subscription} = attrs

	return <Form
		req={req}
		id={attrs.id}
		method="post"
		action={`/initiatives/${initiative.id}/comments`}
		class="comment-form">
		{referrer ? <input type="hidden" name="referrer" value={referrer} /> : null}
		{user && isAdmin(user) ? <PersonaInput t={t} user={user} /> : null}

		<input
			type="text"
			name="title"
			value={newComment && newComment.title}
			maxlength={MAX_COMMENT_TITLE_LENGTH}
			required
			placeholder={t("COMMENT_TITLE_PLACEHOLDER")}
			disabled={!user}
			class="form-input"
		/>

		<textarea
			name="text"
			maxlength={MAX_COMMENT_TEXT_LENGTH}
			required
			placeholder={t("COMMENT_BODY_PLACEHOLDER")}
			disabled={!user}
			class="form-textarea">
			{newComment && newComment.text}
		</textarea>

		<button disabled={!user} class="secondary-button">
			{t("POST_COMMENT")}
		</button>

		{user ? <label class="form-checkbox">
			<input type="hidden" name="subscribe" value="0" />

			<input
				type="checkbox"
				name="subscribe"
				disabled={user.email_confirmed_at == null}
				checked={subscription && subscription.comment_interest}
			/>

			{t("SUBSCRIBE_TO_COMMENTS_WHEN_COMMENTING")}

			{" "}{user.email == null && user.unconfirmed_email == null ?
				Jsx.html(t("SUBSCRIBE_TO_COMMENTS_SET_EMAIL", {userUrl: "/user"}))
			: user.email_confirmed_at == null ?
				t("SUBSCRIBE_TO_COMMENTS_CONFIRM_EMAIL")
			: null}
		</label> : null}

		{!user ? <span class="text signin-to-act">
			{Jsx.html(t("TXT_TOPIC_COMMENT_LOG_IN_TO_PARTICIPATE", {
				url: "/sessions/new"
			}))}
			</span> : <p class="text">
			{Jsx.html(t("COMMENT_FORM_TOC", {url: "/about#tos"}))}
		</p>}
	</Form>
}

function PersonaInput(attrs) {
	var {t} = attrs
	var {user} = attrs

	return <fieldset class="persona-fields">
		<span class="title">{t("COMMENT_FORM_PERSONA_AS")}…</span>

		<label class="persona">
			<input type="radio" name="persona" value="self" required />
			{user.name}
		</label>

		<label class="persona">
			<input type="radio" name="persona" value="admin" required />
			{t("COMMENT_FORM_PERSONA_AS_ADMIN")}
		</label>
	</fieldset>
}

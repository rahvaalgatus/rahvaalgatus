/** @jsx Jsx */
var Jsx = require("j6pack")
var InitiativePage = require("../initiative_page")
var Flash = require("../../page").Flash
var Form = require("../../page").Form
var CommentsController =
	require("root/controllers/initiatives/comments_controller")
var MAX_COMMENT_TITLE_LENGTH = CommentsController.MAX_TITLE_LENGTH
var MAX_COMMENT_TEXT_LENGTH = CommentsController.MAX_TEXT_LENGTH
exports = module.exports = CreatePage
exports.CommentForm = CommentForm

function CreatePage(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var referrer = attrs.referrer
	var newComment = attrs.newComment

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
	var req = attrs.req
	var t = req.t
	var user = req.user
	var initiative = attrs.initiative
	var newComment = attrs.newComment
	var referrer = attrs.referrer
	var subscription = attrs.subscription
	var commentsUrl = `/initiatives/${initiative.uuid}/comments`

	return <Form
		req={req}
		id={attrs.id}
		method="post"
		action={commentsUrl}
		class="comment-form">
		{referrer ? <input type="hidden" name="referrer" value={referrer} /> : null}

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
		</span> : null}
	</Form>
}

/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var InitiativePage = require("../initiative_page")
var Flash = require("../../page").Flash
var I18n = require("root/lib/i18n")
var Form = require("../../page").Form
var FormButton = require("../../page").FormButton
var Comment = require("root/lib/comment")
var Controller = require("root/controllers/initiatives/comments_controller")
var {PersonaInput} = require("./create_page")
var {getCommentAuthorName} = Controller
var {isAdmin} = require("root/lib/user")
var {MAX_TEXT_LENGTH} = Controller
var confirm = require("root/lib/jsx").confirm
exports = module.exports = ReadPage
exports.CommentView = CommentView

function ReadPage(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var comment = attrs.comment
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

				<article class="comment">
					<CommentView
						req={req}
						initiative={initiative}
						comment={comment}
						newComment={newComment}
					/>
				</article>
			</center>
		</section>
	</InitiativePage>
}

function CommentView(attrs) {
	var req = attrs.req
	var t = req.t
	var user = req.user
	var initiative = attrs.initiative
	var comment = attrs.comment
	var commentUrl = `/initiatives/${initiative.uuid}/comments/${comment.id}`
	var newComment = attrs.newComment
	var anonymous = !!comment.anonymized_at

	return <Fragment>
		{comment.uuid ? <a id={"comment-" + comment.uuid} /> : null}

		<h3 class="title"><a href={commentUrl}>{comment.title}</a></h3>

		<div class="metadata">
			<span class={"author" + (anonymous ? " anonymous" : "")}>
				{getCommentAuthorName(t, comment)}
			</span>
			{", "}
			<time datetime={comment.created_at.toJSON()}>
				<a href={commentUrl}>
					{I18n.formatDateTime("numeric", comment.created_at)}
				</a>
			</time>
		</div>

		<p class="text">{Jsx.html(Comment.htmlify(comment.text))}</p>

		{user ? <menu>
			{(
				user.id == comment.user_id &&
				!comment.anonymized_at &&
				new Date - comment.created_at >= 3600 * 1000
			) ? <FormButton
				req={req}
				action={commentUrl}
				name="_method"
				value="delete"
				onclick={confirm(t("ANONYMIZE_COMMENT_CONFIRMATION"))}
				class="comment-delete-button link-button">
				{t("ANONYMIZE_COMMENT")}
			</FormButton> : null}

			<a
				href={`#comment-${comment.id}-reply`}
				class="comment-reply-button link-button">
				{t("REPLY")}
			</a>
		</menu> : null}

		<ol class="comment-replies">{(comment.replies || []).map(function(reply) {
			var anonymous = !!reply.anonymized_at

			return <li
				id={`comment-${reply.id}`}
				class={"comment-reply" + (isCommentShort(reply) ? " short" : "")}>

				{reply.uuid ? <a id={"comment-" + reply.uuid} /> : null}

				<div class="metadata">
					<span class={"author" + (anonymous ? " anonymous" : "")}>
						{getCommentAuthorName(t, reply)}
					</span>
					{", "}
					<time datetime={reply.created_at}>
						<a href={commentUrl + `#comment-${reply.id}`}>
							{I18n.formatDateTime("numeric", reply.created_at)}
						</a>
					</time>
				</div>

				<p class="text">{Jsx.html(Comment.htmlify(reply.text))}</p>
			</li>
		})}</ol>

		{user ? <Form
			req={req}
			id={`comment-${comment.id}-reply`}
			method="post"
			action={commentUrl + "/replies"}
			hidden={!newComment}
			class="comment-reply-form">
			<input type="hidden" name="referrer" value={req.baseUrl + req.path} />
			{user && isAdmin(user) ? <PersonaInput t={t} user={user} /> : null}

			<textarea
				name="text"
				maxlength={MAX_TEXT_LENGTH}
				required
				placeholder={t("PLACEHOLDER_ADD_YOUR_REPLY", {name: comment.user_name})}
				class="form-textarea"
			>
				{newComment && newComment.text}
			</textarea>

			<button class="secondary-button">{t("POST_REPLY")}</button>
		</Form> : null}
	</Fragment>
}

function isCommentShort(comment) {
	return comment.text.length <= 30 && !comment.text.includes("\n")
}

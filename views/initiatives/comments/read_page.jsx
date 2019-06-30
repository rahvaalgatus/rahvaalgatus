/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var InitiativePage = require("../initiative_page")
var Flash = require("../../page").Flash
var I18n = require("root/lib/i18n")
var Form = require("../../page").Form
var Comment = require("root/lib/comment")
var CommentsController =
	require("root/controllers/initiatives/comments_controller")
var MAX_COMMENT_TEXT_LENGTH = CommentsController.MAX_TEXT_LENGTH
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
	var initiative = attrs.initiative
	var comment = attrs.comment
	var commentUrl = `/initiatives/${initiative.id}/comments/${comment.id}`
	var newComment = attrs.newComment

	return <Fragment>
		{comment.uuid ? <a id={"comment-" + comment.uuid} /> : null}

		<span class="author">{comment.user.name}</span>
		{" "}
		<time datetime={comment.created_at}>
			<a href={commentUrl}>
				{I18n.formatDateTime("numeric", comment.created_at)}
			</a>
		</time>

		<h3 class="title"><a href={commentUrl}>{comment.title}</a></h3>
		<p class="text">{Jsx.html(Comment.htmlify(comment.text))}</p>

		{req.user ? <a
			href={`#comment-${comment.id}-reply`}
			class="comment-reply-button white-button">
			{t("REPLY")}
		</a> : null}

		<ol class="comment-replies">{(comment.replies || []).map((reply) => <li
			id={`comment-${reply.id}`}
			class={"comment-reply" + (isCommentShort(reply) ? " short" : "")}>

			{reply.uuid ? <a id={"comment-" + reply.uuid} /> : null}
			<span class="author">{reply.user.name}</span>
			{" "}
			<time datetime={reply.created_at}>
				<a href={commentUrl + `#comment-${reply.id}`}>
					{I18n.formatDateTime("numeric", reply.created_at)}
				</a>
			</time>

			<p class="text">{Jsx.html(Comment.htmlify(reply.text))}</p>
		</li>)} </ol>

		{req.user ? <Form
			req={req}
			id={`comment-${comment.id}-reply`}
			method="post"
			action={commentUrl + "/replies"}
			hidden={!newComment}
			class="comment-reply-form">
			<input type="hidden" name="referrer" value={req.baseUrl + req.path} />

			<textarea
				name="text"
				maxlength={MAX_COMMENT_TEXT_LENGTH}
				required
				placeholder={t("PLACEHOLDER_ADD_YOUR_REPLY", {name: comment.user.name})}
				class="form-textarea"
			>
				{newComment && newComment.text}
			</textarea>

			<button class="secondary-button">{t("POST_REPLY")}</button>
		</Form> : null}
	</Fragment>
}

function isCommentShort(comment) { return comment.text.length <= 30 }

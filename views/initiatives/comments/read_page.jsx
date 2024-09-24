/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Initiative = require("root/lib/initiative")
var InitiativePage = require("../initiative_page")
var Config = require("root").config
var Comment = require("root/lib/comment")
var I18n = require("root/lib/i18n")
var {Flash} = require("../../page")
var {Form} = require("../../page")
var {FormButton} = require("../../page")
var Controller = require("root/controllers/initiatives/comments_controller")
var {PersonaInput} = require("./create_page")
var {getCommentAuthorName} = Controller
var {canAnonymize} = Controller
var {isAdmin} = require("root/lib/user")
var {MAX_TEXT_LENGTH} = Controller
var {confirm} = require("root/lib/jsx")
exports = module.exports = ReadPage
exports.CommentView = CommentView

function ReadPage(attrs) {
	var {req} = attrs
	var {t} = req
	var {initiative} = attrs
	var {comment} = attrs
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
	var {req} = attrs
	var {t} = req
	var {user} = req
	var {initiative} = attrs
	var {comment} = attrs
	var commentPath = `/initiatives/${initiative.uuid}/comments/${comment.id}`
	var initiativeSlugPath = Initiative.slugPath(initiative)
	var commentSlugPath = initiativeSlugPath + `/comments/${comment.id}`
	var {newComment} = attrs
	var anonymous = !!comment.anonymized_at

	return <>
		{comment.uuid ? <a id={"comment-" + comment.uuid} /> : null}

		<h3 class="title"><a href={commentSlugPath}>{comment.title}</a></h3>

		<div class="metadata">
			<span class={"author" + (anonymous ? " anonymous" : "")}>
				{getCommentAuthorName(t, comment)}
			</span>
			{", "}
			<time datetime={comment.created_at.toJSON()}>
				<a href={commentSlugPath}>
					{I18n.formatDateTime("numeric", comment.created_at)}
				</a>
			</time>
		</div>

		<CommentText
			t={t}
			comment={comment}
			user={user}
			path={commentSlugPath}
		/>

		{user ? <menu>
			<a
				href={`#comment-${comment.id}-reply`}
				class="comment-reply-button link-button">
				{t("REPLY")}
			</a>

			{(
				user.id == comment.user_id &&
				comment.anonymized_at == null &&
				canAnonymize(new Date, comment)
			) ? <CommentDeleteButton req={req} t={t} comment={comment} /> : null}

			{user.id != comment.user_id && comment.walled == null ?
				(comment.reported_at
					? <span class="comment-reported">Raporteeritud</span>
					: <CommentReportButton req={req} t={t} comment={comment} />
				)
			: null}
		</menu> : null}

		<ol class="comment-replies">{(comment.replies || []).map(function(reply) {
			var anonymous = !!reply.anonymized_at
			var replySlugPath = commentSlugPath + `#comment-${reply.id}`

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
						<a href={replySlugPath}>
							{I18n.formatDateTime("numeric", reply.created_at)}
						</a>
					</time>
				</div>

				<CommentText
					t={t}
					comment={reply}
					user={user}
					path={replySlugPath}
				/>

				{user ? <menu>
					{(
						user.id == reply.user_id &&
						reply.anonymized_at == null &&
						canAnonymize(new Date, reply)
					) ? <CommentDeleteButton req={req} t={t} comment={reply} /> : null}

					{user.id != reply.user_id && reply.walled == null ?
						(reply.reported_at
							? <span class="comment-reported">Raporteeritud</span>
							: <CommentReportButton req={req} t={t} comment={reply} />
						)
					: null}
				</menu> : null}
			</li>
		})}</ol>

		{user ? <Form
			req={req}
			id={`comment-${comment.id}-reply`}
			method="post"
			action={commentPath + "/replies"}
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
	</>
}

function CommentDeleteButton({req, t, comment}) {
	var commentsPath = `/initiatives/${comment.initiative_uuid}/comments`

	return <FormButton
		req={req}
		action={`${commentsPath}/${comment.id}`}
		name="_method"
		value="delete"
		onclick={confirm(t("comment_page.comment.anonymize_button_confirmation"))}
		class="comment-delete-button link-button"
		formClass="comment-delete-form"
	>
		{t("comment_page.comment.anonymize_button")}
	</FormButton>
}

function CommentReportButton({req, t, comment}) {
	var commentsPath = `/initiatives/${comment.initiative_uuid}/comments`

	return <FormButton
		req={req}
		action={`${commentsPath}/${comment.id}/reports`}
		name="_method"
		onclick={confirm(t("comment_page.comment.report_button_confirmation"))}
		class="comment-report-button link-button"
		formClass="comment-report-form"
	>
		{t("comment_page.comment.report_button")}
	</FormButton>
}

function CommentText({t, user, comment, path}) {
	var commentText = Jsx.html(Comment.htmlify(comment.text))

	if (comment.walled) {
		var unwallCheckboxId = `comment-${comment.id}-unwall`

		if (user) return <>
			<input
				type="checkbox"
				id={unwallCheckboxId}
				class="unwall-checkbox"
				hidden
			/>

			<label class="unwall-button" for={unwallCheckboxId}>
				{Jsx.html(t("comment_page.comment.unwall_button"))}
			</label>

			<p class="text">{commentText}</p>
		</>

		return <div class="walled">{Jsx.html(t("comment_page.comment.walled", {
			signInUrl: _.escapeHtml(
				"/sessions/new?referrer=" + encodeURIComponent(path)
			)
		}))}</div>
	}

	return <p class="text">{commentText}</p>
}

function isCommentShort(comment) {
	return comment.text.length <= 30 && !comment.text.includes("\n")
}

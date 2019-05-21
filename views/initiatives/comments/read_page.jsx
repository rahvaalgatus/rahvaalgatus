/** @jsx Jsx */
var Jsx = require("j6pack")
var InitiativePage = require("../initiative_page")
var CommentView = require("../read_page").CommentView
var Flash = require("../../page").Flash

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var comment = attrs.comment
	var editedComment = comment

	return <InitiativePage
		page="initiative-comment"
		class="initiative-page"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<section id="initiative-comment" class="primary-section">
			<center>
				<Flash flash={req.flash} />

				<h2>{t("COMMENT_HEADING")}</h2>

				<article class="comment">
					<CommentView
						req={req}
						initiative={initiative}
						comment={comment}
						editedComment={editedComment}
					/>
				</article>
			</center>
		</section>
	</InitiativePage>
}

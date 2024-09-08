var _ = require("root/lib/underscore")
var MediaType = require("medium-type")
var Initiative = require("root/lib/initiative")
var outdent = require("root/lib/outdent")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var {pseudoDateTime} = require("root/lib/crypto")
var HTML_TYPE = new MediaType("text/html")

module.exports = function(attrs) {
	var phase = attrs && attrs.phase || "edit"
	var external = attrs && attrs.external

	var title = attrs.title == null
		? "Local initiative #" + _.uniqueId()
		: attrs.title

	var text = outdent`<body>
		<p>Make the world a better place for ${_.uniqueId()} people.</p>
	</body>`

	return _.assign({
		uuid: _.serializeUuid(_.uuidV4()),
		user_id: null,
		title,
		slug: Initiative.slug(title),
		author_name: "",
		author_url: "",
		author_contacts: "",
		created_at: pseudoDateTime(),
		community_url: "",
		url: "",
		phase: phase,
		signing_started_at: phase == "sign" ? pseudoDateTime() : null,
		signing_ends_at: phase == "sign" ? pseudoDateTime() : null,
		signing_expired_at: null,
		signing_expiration_email_sent_at: null,
		published_at: phase != "edit" || external ? pseudoDateTime() : null,
		tags: [],

		discussion_ends_at: (
			phase == "edit" && attrs && attrs.published_at ? pseudoDateTime() : null
		),

		organizations: [],
		text: phase != "edit" && !external ? text : null,
		text_type: phase != "edit" && !external ? HTML_TYPE : null,
		text_sha256: phase != "edit" && !external ? sha256(text) : null,
		destination: phase != "edit" ? "parliament" : null,
		meetings: [],
		media_urls: [],
		government_agency: null,
		government_contact: null,
		government_contact_details: null,
		government_decision: null,
		government_change_urls: [],
		public_change_urls: [],
		signature_milestones: {},
		notes: "",
		language: "et",
		has_paper_signatures: false,
		undersignable: true,
		external: false,
		external_text_file_id: null,
		parliament_synced_at: null,
		parliament_token: null,
		sent_to_parliament_at: null,
		received_by_parliament_at: null,
		accepted_by_parliament_at: null,
		finished_in_parliament_at: null,
		sent_to_government_at: null,
		received_by_government_at: null,
		accepted_by_government_at: null,
		finished_in_government_at: null,
		parliament_decision: null,
		parliament_committees: [],
		parliament_uuid: null,
		discussion_end_email_sent_at: null,
		signing_end_email_sent_at: null,
		archived_at: null,
		signatures_anonymized_at: null,
		signature_threshold: null,
		signature_threshold_at: null,
		last_comment_created_at: null,
		last_event_created_at: null
	}, attrs)
}

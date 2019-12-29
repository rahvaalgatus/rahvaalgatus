var _ = require("root/lib/underscore")
var MediaType = require("medium-type")
var newUuid = require("uuid/v4")
var outdent = require("root/lib/outdent")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var HTML_TYPE = new MediaType("text/html")

module.exports = function(attrs) {
	var phase = attrs && attrs.phase || "edit"
	var external = attrs && attrs.external

	var text = outdent`<body>
		Make the world a better place for ${_.uniqueId} people.
	</body>`

	return _.assign({
		uuid: newUuid(),
		title: "",
		author_name: "",
		author_url: "",
		created_at: new Date,
		community_url: "",
		url: "",
		phase: phase,
		organizations: [],
		text: phase != "edit" && !external ? text : null,
		text_type: phase != "edit" && !external ? HTML_TYPE : null,
		text_sha256: phase != "edit" && !external ? sha256(text) : null,
		meetings: [],
		media_urls: [],
		government_agency: null,
		government_contact: null,
		government_contact_details: null,
		government_decision: null,
		sent_to_government_at: null,
		finished_in_government_at: null,
		government_change_urls: [],
		public_change_urls: [],
		signature_milestones: {},
		notes: "",
		has_paper_signatures: false,
		undersignable: false,
		mailchimp_interest_id: null,
		external: false,
		parliament_api_data: null,
		parliament_synced_at: null,
		parliament_token: null,
		sent_to_parliament_at: null,
		received_by_parliament_at: null,
		accepted_by_parliament_at: null,
		finished_in_parliament_at: null,
		parliament_decision: null,
		parliament_committee: null,
		parliament_uuid: null,
		discussion_end_email_sent_at: null,
		signing_end_email_sent_at: null,
		archived_at: null
	}, attrs)
}

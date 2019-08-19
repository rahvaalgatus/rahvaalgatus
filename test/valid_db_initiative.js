var _ = require("root/lib/underscore")
var newUuid = require("uuid/v4")

module.exports = function(attrs) {
	return _.assign({
		uuid: newUuid(),
		title: "",
		author_name: "",
		author_url: "",
		created_at: new Date,
		community_url: "",
		url: "",
		phase: "edit",
		organizations: [],
		meetings: [],
		media_urls: [],
		government_agency: null,
		government_contact: null,
		government_contact_details: null,
		sent_to_government_at: null,
		finished_in_government_at: null,
		government_change_urls: [],
		public_change_urls: [],
		signature_milestones: {},
		notes: "",
		has_paper_signatures: false,
		mailchimp_interest_id: null,
		external: false,
		parliament_api_data: null,
		parliament_synced_at: null,
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

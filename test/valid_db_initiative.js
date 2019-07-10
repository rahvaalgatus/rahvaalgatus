var _ = require("root/lib/underscore")
var newUuid = require("uuid/v4")

module.exports = function(attrs) {
	return _.assign({
		uuid: newUuid(),
		author_url: "",
		community_url: "",
		url: "",
		phase: "edit",
		organizations: [],
		meetings: [],
		media_urls: [],
		government_change_urls: [],
		public_change_urls: [],
		signature_milestones: {},
		notes: "",
		has_paper_signatures: false,
		mailchimp_interest_id: null,
		parliament_api_data: null,
		sent_to_parliament_at: null,
		received_by_parliament_at: null,
		accepted_by_parliament_at: null,
		finished_in_parliament_at: null,
		discussion_end_email_sent_at: null,
		signing_end_email_sent_at: null,
		archived_at: null
	}, attrs)
}

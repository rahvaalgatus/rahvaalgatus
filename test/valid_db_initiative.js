var O = require("oolong")
var newUuid = require("uuid/v4")

module.exports = function(attrs) {
	return O.assign({
		uuid: newUuid(),
		author_url: "",
		community_url: "",
		url: "",
		organizations: [],
		meetings: [],
		media_urls: [],
		signature_milestones: {},
		notes: "",
		mailchimp_interest_id: null,
		parliament_api_data: null,
		sent_to_parliament_at: null,
		finished_in_parliament_at: null,
		discussion_end_email_sent_at: null,
		signing_end_email_sent_at: null
	}, attrs)
}

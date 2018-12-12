var O = require("oolong")
var newUuid = require("uuid/v4")

module.exports = function(attrs) {
	return O.assign({
		uuid: newUuid(),
		notes: "",
		mailchimp_interest_id: null,
		parliament_api_data: null
	}, attrs)
}

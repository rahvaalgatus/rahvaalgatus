var O = require("oolong")
var newUuid = require("uuid/v4")

module.exports = function(attrs) {
	return O.assign({
		uuid: newUuid(),
		notes: "",
		parliament_api_data: null,
		sent_to_parliament_at: null,
		finished_in_parliament_at: null
	}, attrs)
}

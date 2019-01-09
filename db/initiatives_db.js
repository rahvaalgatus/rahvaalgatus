var O = require("oolong")
var db = require("root").db

exports.search = function(uuid) {
	return db.read("SELECT * FROM initiatives WHERE uuid = ?", [uuid]).then(parse)
}

exports.read = exports.search

exports.parse = function(obj) {
	return O.defaults({
		parliament_api_data:
			obj.parliament_api_data && JSON.parse(obj.parliament_api_data),
		sent_to_parliament_at:
			obj.sent_to_parliament_at && new Date(obj.sent_to_parliament_at)
	}, obj)
}

function parse(obj) {
	if (obj == null) return null
	if (Array.isArray(obj)) return obj.map(exports.parse)
	return exports.parse(obj)
}

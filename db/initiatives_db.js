var O = require("oolong")
var db = require("root").db

exports.read = function(uuid) {
	return db.read("SELECT * FROM initiatives WHERE uuid = ?", [uuid]).then(parse)
}

exports.parse = function(obj) {
	return O.defaults({
		parliament_api_data: obj.parliament_api_data == null
			? null
			: JSON.parse(obj.parliament_api_data)
	}, obj)
}

function parse(obj) {
	if (obj == null) return null
	if (Array.isArray(obj)) return obj.map(exports.parse)
	return exports.parse(obj)
}

var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "initiative_events")

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		occurred_at: attrs.occurred_at && new Date(attrs.occurred_at),

		content: "content" in attrs
			? parseContent(attrs.type, attrs.content)
		: undefined
	}, attrs)
}

exports.serialize = function(event) {
	var attrs = _.defaults({
		content: serializeContent(event.type, event.content)
	}, event)

	delete attrs.files
	return attrs
}

function parseContent(type, data) {
	switch (type) {
		case "parliament-received":
		case "parliament-finished": return null
		case "parliament-accepted":
		case "parliament-letter":
		case "parliament-decision":
		case "parliament-interpellation":
		case "parliament-national-matter":
		case "parliament-board-meeting":
		case "parliament-committee-meeting": return JSON.parse(data)
		case "text": return data
		default: throw new RangeError("Unsupported event type: " + type)
	}
}

function serializeContent(type, data) {
	switch (type) {
		case "parliament-received":
		case "parliament-finished": return null
		case "parliament-accepted":
		case "parliament-letter":
		case "parliament-decision":
		case "parliament-interpellation":
		case "parliament-national-matter":
		case "parliament-board-meeting":
		case "parliament-committee-meeting": return JSON.stringify(data)
		case "text": return data
		default: throw new RangeError("Unsupported event type: " + type)
	}
}

var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var MediaType = require("medium-type")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "initiative_texts")

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		content_type: MediaType.parse(attrs.content_type),

		content: "content" in attrs
			? parseContent(attrs.content_type, attrs.content)
		: undefined
	}, attrs)
}

exports.serialize = function(text) {
	return _.defaults({
		content: serializeContent(text.content_type, text.content)
	}, text)
}

function parseContent(type, data) {
	switch (String(type)) {
		case "text/html": return data
		case "application/vnd.basecamp.trix+json": return JSON.parse(String(data))
		case "application/vnd.citizenos.etherpad+html": return data
		default: throw new RangeError("Unsupported content type: " + type)
	}
}

function serializeContent(type, data) {
	switch (String(type)) {
		case "text/html": return data
		case "application/vnd.basecamp.trix+json": return JSON.stringify(data)
		case "application/vnd.citizenos.etherpad+html": return data
		default: throw new RangeError("Unsupported content type: " + type)
	}
}

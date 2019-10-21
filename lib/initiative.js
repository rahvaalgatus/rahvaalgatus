var Config = require("root/config")
var Mime = require("mime")

exports.PHASES = ["edit", "sign", "parliament", "government", "done"]
exports.PARLIAMENT_DECISIONS = ["reject", "forward", "solve-differently"]

exports.COMMITTEE_MEETING_DECISIONS = [
	"continue",
	"reject",
	"forward",
	"solve-differently"
]

exports.imageUrl = function(image) {
	var ext = Mime.extension(String(image.type))
	return Config.url + "/initiatives/" + image.initiative_uuid + "." + ext
}

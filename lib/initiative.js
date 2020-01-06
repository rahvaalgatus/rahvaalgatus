var Mime = require("mime")
var Config = require("root/config")
var LOCAL_GOVERNMENTS = require("./local_governments")

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

exports.getRequiredSignatureCount = function(initiative) {
	if (initiative.destination == "parliament") return Config.votesRequired
	// https://www.riigiteataja.ee/akt/13312632?leiaKehtiv#para32
	var population = LOCAL_GOVERNMENTS[initiative.destination].population
	return Math.max(Math.round(population * 0.01), 5)
}

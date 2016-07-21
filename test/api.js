var Config = require("root/config/test")
var TOKEN = Config.sessions[1] // Use second test number for automations.
var api = require("root/lib/citizen_os")
var fetchDefaults = require("fetch-defaults")

exports = module.exports = function() {
  before(exports.create)
  after(exports.delete)
}

exports.create = function() {
	this.api = fetchDefaults(api, Config.apiUrl, {
		headers: {Authorization: "Bearer " + TOKEN}
	})
}

exports.delete = function() {
	delete this.api
}

var Config = require("root/config/test")
var api = require("root/lib/citizen_os")
var fetchDefaults = require("fetch-defaults")

exports = module.exports = function() {
  before(exports.create)
  after(exports.delete)
}

exports.create = function() {
	this.api = fetchDefaults(api, Config.apiUrl, {
		headers: {Authorization: "Bearer " + Config.sessions[0]}
	})
}

exports.delete = function() {
	delete this.api
}

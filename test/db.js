var sqlite = require("root").sqlite

exports = module.exports = function() {
	beforeEach(exports.delete)
}

exports.delete = function*() {
	yield sqlite.delete("DELETE FROM initiatives")
	yield sqlite.delete("DELETE FROM initiative_subscriptions")
}

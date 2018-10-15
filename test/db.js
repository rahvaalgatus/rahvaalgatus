var db = require("root").db

exports = module.exports = function() {
	beforeEach(exports.delete)
}

exports.delete = function*() {
	yield db.delete("DELETE FROM initiatives")
}

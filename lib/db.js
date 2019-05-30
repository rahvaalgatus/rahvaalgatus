var _ = require("root/lib/underscore")
var SqliteHeaven = require("heaven-sqlite")
module.exports = Db

function Db(model, sqlite, table) {
	SqliteHeaven.call(this, model, sqlite, table)
}

Db.prototype = Object.create(SqliteHeaven.prototype, {
	constructor: {value: Db, configurable: true, writeable: true}
})

Db.prototype.assign = function(model, attrs) {
	return _.assign({}, model, attrs)
}

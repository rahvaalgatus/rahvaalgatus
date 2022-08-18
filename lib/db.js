var _ = require("root/lib/underscore")
var SqliteHeaven = require("heaven-sqlite/better")
module.exports = Db

function Db(model, sqlite, table) {
	SqliteHeaven.call(this, model, sqlite, table)
}

Db.prototype = Object.create(SqliteHeaven.prototype, {
	constructor: {value: Db, configurable: true, writeable: true}
})

// eslint-disable-next-line consistent-return
Db.prototype.update = function(query, attrs) {
	SqliteHeaven.prototype.update.call(this, query, attrs)
	if (query instanceof this.model) return this.assign(query, attrs)
}

Db.prototype.assign = function(model, attrs) {
	return _.assign({}, model, attrs)
}

var _ = require("root/lib/underscore")
var SqliteHeaven = require("heaven-sqlite")
module.exports = Db

function Db(model, sqlite, table) {
	SqliteHeaven.call(this, model, sqlite, table)
}

Db.prototype = Object.create(SqliteHeaven.prototype, {
	constructor: {value: Db, configurable: true, writeable: true}
})

Db.prototype._update = function(query, attrs) {
	var updated = SqliteHeaven.prototype._update.call(this, query, attrs)

	if (query instanceof this.model)
		return updated.then(_.const(_.create(query, attrs)))
	else
		return updated
}

Db.prototype.assign = function(model, attrs) {
	return _.assign({}, model, attrs)
}

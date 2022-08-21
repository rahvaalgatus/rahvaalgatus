var StandardError = require("standard-error")
module.exports = SqliteError

function SqliteError(err) {
	StandardError.call(this, err.message, parse(err))
}

SqliteError.prototype = Object.create(StandardError.prototype, {
	constructor: {value: SqliteError, configurable: true, writeable: true}
})

function parse(err) {
	var match
	var {code} = err
	var props = {code: /^SQLITE_/.test(code) ? code.slice(7).toLowerCase() : code}

	// https://sqlite.org/rescode.html
	// https://www.sqlite.org/c3ref/c_abort.html
	switch (code) {
		case "SQLITE_CONSTRAINT_CHECK":
			if (match = /CHECK constraint failed: (\w+)$/.exec(err.message)) {
				props.code = "constraint"
				props.type = "check"
				props.constraint = match[1]
			}
			break

		case "SQLITE_CONSTRAINT_FOREIGNKEY":
			if (match = /FOREIGN KEY constraint failed/.exec(err.message)) {
				props.code = "constraint"
				props.type = "foreign_key"
			}
			break

		case "SQLITE_CONSTRAINT_PRIMARYKEY":
		case "SQLITE_CONSTRAINT_UNIQUE":
			if (match = /UNIQUE constraint failed: (\w+\.\w+(?:, \w+\.\w+)*)$/.exec(
				err.message
			)) {
				props.code = "constraint"
				props.type = "unique"
				props.table = match[1].replace(/\..*/, "")
				var names = match[1].split(/, /g)
				props.columns = names.map((name) => name.replace(/[^.]+\./, ""))
			}
			else if (match = /UNIQUE constraint .* index '(\w+)'/.exec(err.message)) {
				props.code = "constraint"
				props.type = "unique"
				props.index = match[1]
			}
			break
	}

	return props
}

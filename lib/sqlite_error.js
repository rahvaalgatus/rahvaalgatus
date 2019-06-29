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
	var code = err.code
	var props = {code: /^SQLITE_/.test(code) ? code.slice(7).toLowerCase() : code}

	// https://www.sqlite.org/c3ref/c_abort.html
	switch (code) {
		case "SQLITE_CONSTRAINT":
			if (match = /UNIQUE constraint .* index '(\w+)'/.exec(err.message)) {
				props.type = "unique"
				props.index = match[1]
			}
			else if (match = /CHECK constraint failed: (\w+)$/.exec(err.message)) {
				props.type = "check"
				props.constraint = match[1]
			}
			break
	}

	return props
}

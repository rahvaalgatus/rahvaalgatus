exports.serialize = function(tuple) {
	return tuple.map((value) => (
		/["\r\n,]/.test(value) ? "\"" + value.replace(/"/g, "\"\"") + "\"" : value
	)).join(",")
}

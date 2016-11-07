exports.linearBackground = function(color, completion) {
	var percent = completion * 100 + "%"

	return "background-image: linear-gradient(" + [
		"to right",
		`${color} 0%`,
		`${color} ${percent}`,
		`transparent ${percent}`,
		"transparent 100%"
	].join(", ") + ")"
}

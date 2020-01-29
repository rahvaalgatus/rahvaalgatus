exports.ensureAreaCode = function(number) {
	number = number.replace(/[-()[\] ]/g, "")

	// As of Dec, 2019, numbers without a leading "+", even if otherwise prefixed
	// with a suitable area code (~372), don't work. They used to with the
	// Digidoc Service API.
	if (/^\+/.test(number)) return number
	if (/^3[567][0-9]/.test(number)) return "+" + number
	return "+372" + number
}

exports.getNormalizedErrorCode = function(err) {
	return (
		isMobileIdPersonalIdError(err) ? "NOT_FOUND" :
		isMobileIdPhoneNumberError(err) ? "NOT_FOUND"
		: err.code
	)

	function isMobileIdPersonalIdError(err) {
		return (
			err.code == "BAD_REQUEST" &&
			err.message.match(/\bnationalIdentityNumber\b/)
		)
	}

	function isMobileIdPhoneNumberError(err) {
		return (
			err.code == "BAD_REQUEST" &&
			err.message.match(/\bphoneNumber\b/)
		)
	}
}

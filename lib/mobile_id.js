exports.MOBILE_ID_ERROR_STATUS_CODES = {
	NOT_FOUND: 422,
	NOT_ACTIVE: 422,
	TIMEOUT: 410,
	INVALID_SIGNATURE: 410,
	NOT_MID_CLIENT: 410,
	USER_CANCELLED: 410,
	SIGNATURE_HASH_MISMATCH: 410,
	PHONE_ABSENT: 410,
	DELIVERY_ERROR: 410,
	SIM_ERROR: 410,
}

exports.MOBILE_ID_ERROR_STATUS_MESSAGES = {
	NOT_FOUND: "Not a Mobile-Id User or Personal Id Mismatch",
	NOT_ACTIVE: "Mobile-Id Certificates Not Activated",
	TIMEOUT: "Mobile-Id Timeout",
	INVALID_SIGNATURE: "Invalid Mobile-Id Signature",
	NOT_MID_CLIENT: "Mobile-Id Certificates Not Activated",
	USER_CANCELLED: "Mobile-Id Cancelled",
	SIGNATURE_HASH_MISMATCH: "Mobile-Id Signature Hash Mismatch",
	PHONE_ABSENT: "Mobile-Id Phone Absent",
	DELIVERY_ERROR: "Mobile-Id Delivery Error",
	SIM_ERROR: "Mobile-Id SIM Application Error"
}

exports.MOBILE_ID_ERROR_TEXTS = {
	NOT_FOUND: "MOBILE_ID_ERROR_NOT_FOUND",
	NOT_ACTIVE: "MOBILE_ID_ERROR_NOT_ACTIVE",
	TIMEOUT: "MOBILE_ID_ERROR_TIMEOUT",
	INVALID_SIGNATURE: "MOBILE_ID_ERROR_INVALID_SIGNATURE",
	NOT_MID_CLIENT: "MOBILE_ID_ERROR_NOT_ACTIVE",
	USER_CANCELLED: "MOBILE_ID_ERROR_USER_CANCELLED",
	SIGNATURE_HASH_MISMATCH: "MOBILE_ID_ERROR_SIGNATURE_HASH_MISMATCH",
	PHONE_ABSENT: "MOBILE_ID_ERROR_PHONE_ABSENT",
	DELIVERY_ERROR: "MOBILE_ID_ERROR_DELIVERY_ERROR",
	SIM_ERROR: "MOBILE_ID_ERROR_SIM_ERROR"
}

exports.ensureAreaCode = ensureAreaCode

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

function ensureAreaCode(number) {
	number = number.replace(/[-()[\] ]/g, "")

	// As of Dec, 2019, numbers without a leading "+", even if otherwise prefixed
	// with a suitable area code (~372), don't work. They used to with the
	// Digidoc Service API.
	if (/^\+/.test(number)) return number
	if (/^3[567][0-9]/.test(number)) return "+" + number
	return "+372" + number
}

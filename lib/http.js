exports.isOk = function(res) {
	return res.statusCode >= 200 && res.statusCode < 300
}

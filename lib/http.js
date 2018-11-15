exports.isOk = function(res) {
	return res.statusCode >= 200 && res.statusCode < 300
}

exports.serializeAuth = function(user, password) {
  return new Buffer(user + ":" + password).toString("base64")
}

exports.parseAuth = function(text) {
	var schemeAndAuth = text.split(" ")
	if (schemeAndAuth[0] !== "Basic") return null
	var auth = new Buffer(schemeAndAuth[1], "base64").toString()
	var i = auth.indexOf(":")
	return [auth.slice(0, i), auth.slice(i + 1)]
}

exports.wait = function(obj, event) {
	return new Promise(obj.once.bind(obj, event))
}

exports.sleep = function(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

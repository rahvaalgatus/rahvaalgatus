var NODE_METHODS = new Set(require("http").METHODS)

module.exports = function(req, _res, next) {
	req.originalMethod = req.originalMethod || req.method
	if (req.originalMethod != "POST") return void next()

  var newMethod = (
		req.body != null &&
		req.body._method &&
		String(req.body._method).toUpperCase()
	)

	if (newMethod && NODE_METHODS.has(newMethod)) req.method = newMethod
	next()
}

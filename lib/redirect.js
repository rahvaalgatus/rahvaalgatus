module.exports = function(status, url) {
  if (typeof status != "number") throw new TypeError("Status must be a number")
	if (url.indexOf(":") >= 0) url = parse(url)
  return redirect.bind(null, status, url)
}

function redirect(status, url, req, res) {
  var query = req.url.indexOf("?")
	if (typeof url == "function") url = url(req)
  res.redirect(status, query == -1 ? url : url + req.url.slice(query))
}

function parse(url) {
	return (req) => url.replace(/:(\w+)/g, (_match, param) => req.params[param])
}

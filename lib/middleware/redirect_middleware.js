module.exports = function(status, url) {
  if (typeof status != "number") throw new TypeError("Status must be a number")
  return redirect.bind(null, status, url)
}

function redirect(status, url, req, res) {
  var query = req.url.indexOf("?")
  res.redirect(status, query == -1 ? url : url + req.url.slice(query))
}

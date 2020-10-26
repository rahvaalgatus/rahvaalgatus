module.exports = function(_req, res, next) {
	res.setHeader("Cache-Control", "no-cache")
  next()
}

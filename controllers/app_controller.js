var Router = require("express").Router
var PUBLIC_DIR = __dirname + "/../public"
exports.read = read

exports.router = Router({mergeParams: true})
exports.router.use("/*", exports.read)

function read(req, res, next) {
  res.sendFile("app.html", {root: PUBLIC_DIR})
}

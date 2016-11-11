var Router = require("express").Router
var PUBLIC_DIR = __dirname + "/../public"

exports.router = Router({mergeParams: true})

exports.read = function(req, res, next) {
  res.sendFile("app.html", {root: PUBLIC_DIR})
}

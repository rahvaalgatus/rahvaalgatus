module.exports = require("method-override")(function(req) {
  return req.body != null && req.body._method
})

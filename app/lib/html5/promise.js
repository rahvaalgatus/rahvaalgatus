module.exports = function(window) {
  if (window.Promise) return
  window.Promise = require("promise/lib/es6-extensions")
}

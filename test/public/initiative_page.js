"use strict"
var Url = require("url")
var Page = require("./page")
var co = require("co")
var lazy = require("lazy-object").defineLazyProperty

class InitiativePage extends Page {}
module.exports = InitiativePage

lazy(InitiativePage.prototype, "id", co.wrap(function*() {
	var url = Url.parse(yield this.browser.getCurrentUrl())
	return url.pathname.split("/")[2]
}))

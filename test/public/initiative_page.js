"use strict"
var Url = require("url")
var Page = require("./page")
var co = require("co")
var lazy = require("lazy-object").defineLazyProperty

class InitiativePage extends Page {}
module.exports = InitiativePage

InitiativePage.open = co.wrap(function*(browser, baseUrl, id) {
	yield browser.get(baseUrl + "/topics/" + id)
	yield sleep(500)
	return new InitiativePage(browser)
})

// This could be used when redirected to the initiative page.
lazy(InitiativePage.prototype, "id", co.wrap(function*() {
	var url = Url.parse(yield this.browser.getCurrentUrl())
	return url.pathname.split("/")[2]
}))

InitiativePage.prototype.invite = function() {
	return this.el.querySelector(".invite-authors-button").click()
}

function sleep(timeout) { return (fn) => setTimeout(fn, timeout) }

"use strict"
var Moment = require("moment")
var Page = require("./page")
var InitiativePage = require("./initiative_page")
var co = require("co")
var lazies = require("lazy-object").defineLazyProperties

class InitiativeCreatePage extends Page {}
module.exports = InitiativeCreatePage

InitiativeCreatePage.open = co.wrap(function*(browser, baseUrl) {
	yield browser.get(baseUrl + "/topics/new")
	yield sleep(500)
	return new InitiativeCreatePage(browser)
})

InitiativeCreatePage.prototype.nextButton = ".create-initiative-button"

InitiativeCreatePage.prototype.acceptTos = co.wrap(function*() {
	// An URL inside the <label> interferes with clicking. Workaround for now.
	yield this.browser.eval(function() {
		document.querySelector("label[for=accept-tos]").click()
	})
})

InitiativeCreatePage.prototype.next = co.wrap(function*() {
	yield this.el.querySelector(this.nextButton).click()
	yield sleep(1000)

	switch (this.nextButton) {
		case ".create-initiative-button":
			return {__proto__: this, nextButton: ".create-deadline-button"}
		case ".create-deadline-button":
			return {__proto__: this, nextButton: ".create-authors-button"}
		case ".create-authors-button":
			return new InitiativePage(this.browser)

		default: throw new Error("Unknown state")
	}
})

InitiativeCreatePage.prototype.setDeadline = function(deadline) {
	return this.el.querySelector(`a[data-date="${formatDate(deadline)}"]`).click()
}

lazies(InitiativeCreatePage.prototype, {
  title: function() { return this.el.querySelector("input[name=title]") },
  author: function() { return this.el.querySelector("input[ng-model=term]") },
})

function formatDate(date) { return Moment(date).format("YYYY-MM-DD") }
function sleep(timeout) { return (fn) => setTimeout(fn, timeout) }

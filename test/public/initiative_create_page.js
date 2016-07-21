"use strict"
var Moment = require("moment")
var Page = require("./page")
var InitiativePage = require("./initiative_page")
var co = require("co")
var lazies = require("lazy-object").defineLazyProperties

class InitiativeCreatePage extends Page {
	constructor(el, step) {
		super(el)
		if (step) this.step = step
	}
}

module.exports = InitiativeCreatePage

InitiativeCreatePage.open = co.wrap(function*(browser, baseUrl) {
	yield browser.get(baseUrl + "/topics/new")
	yield sleep(500)
	return new InitiativeCreatePage(browser)
})

InitiativeCreatePage.prototype.step = "title"

InitiativeCreatePage.prototype.acceptTos = co.wrap(function*() {
	// An URL inside the <label> interferes with clicking. Workaround for now.
	yield this.browser.eval(function() {
		document.querySelector("label[for=accept-tos]").click()
	})
})

InitiativeCreatePage.prototype.next = co.wrap(function*() {
	var selector
	switch (this.step) {
		case "title": selector = ".create-initiative-button"; break
		case "deadline": selector = ".create-deadline-button"; break
		case "authors": selector = ".create-authors-button"; break
		default: throw new Error("Unknown state: " + this.step)
	}

	yield this.el.querySelector(selector).click()
	yield sleep(1000)

	switch (this.step) {
		case "title": return new InitiativeCreatePage(this.el, "deadline")
		case "deadline": return new InitiativeCreatePage(this.el, "authors")
		case "authors": return new InitiativePage(this.browser)
		default: throw new Error("Unknown state: " + this.step)
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

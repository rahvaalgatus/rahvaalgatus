var _ = require("lodash")
var Selenium = require("selenium-webdriver")
var SeleniumError = require("selenium-webdriver").error.Error
var WebElement = require("selenium-webdriver").WebElement
var WIDTH = 1024
var HEIGHT = 600

require("selenium-dom")(Selenium)

Selenium.promise.controlFlow().removeAllListeners("uncaughtException")
Selenium.promise.controlFlow().on("uncaughtException", function(err) {
	if (err instanceof SeleniumError) console.error(err)
	else throw err
})

exports = module.exports = function() {
	beforeEach(exports.open)
	afterEach(exports.close)
}

exports.open = function*() {
	// Starting the server et al. is not the fastest process.
	// This timeout only applies to this beforeEach function.
	this.timeout(10000)

	var browser = global.browser

	if (browser == null) {
		browser = global.browser = startBrowser()
		browser.manage().timeouts().setScriptTimeout(1000)
		browser.name = (yield browser.getSession()).getCapability("browserName")

		var width = yield browser.executeScript("return window.screen.width")
		yield browser.manage().window().setSize(WIDTH, HEIGHT)
		yield browser.manage().window().setPosition(width - WIDTH, 0)
	}

	this.browser = browser
}

exports.close = function() {
	// Some unused promises or requests in the Selenium queue may throw after the
	// test. Catch and ignore those errors here.
	return Promise.all([
		this.browser.manage().deleteAllCookies()
	]).catch(_.noop)
}

WebElement.prototype.isPresent = function() {
	// Perhaps checking getTagName is cheaper than isDisplayed.
	return this.getTagName().then(_.constant(true), function(err) {
		if (isElementNotPresentError(err)) return false
		throw err
	})
}

WebElement.prototype.isNotPresent = function() {
	return this.isPresent().then((present) => !present)
}

function startBrowser() {
	return new Selenium.Builder().build()
}

function isElementNotPresentError(err) {
	// The "Not a WebElement" error is a plain TypeError.
	if (err.message == "Custom locator did not return a WebElement") return true
	if (err.name == "NoSuchElementError") return true
	if (err.name == "StaleElementReferenceError") return true
	return false
}

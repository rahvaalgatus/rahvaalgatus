var lazy = require("lazy-object").defineLazyProperty
module.exports = Page

function Page(el) {
	this.el = el
}

lazy(Page.prototype, "browser", function() { return this.el.getDriver() })

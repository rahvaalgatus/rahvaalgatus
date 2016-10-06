var DAY = 86400

if (process.env.TEST.match(/\bui\b/))
describe("Account view", function() {
	require("root/test/web")()
	require("root/test/api")()
	require("root/test/browser")()
	this.timeout(10000)

	describe("/", function() {
		it("must show beta warning", function*() {
			yield this.browser.get(this.url)
			var dialog = yield this.browser.querySelector("#dear_user_dialog")
			yield dialog.isDisplayed().must.then.be.true()
		})

		it("must not show beta warning twice", function*() {
			yield this.browser.get(this.url)
			var dialog

			dialog = this.browser.querySelector("#dear_user_dialog")
			yield dialog.querySelector("[title=Close]").click()

			yield this.browser.get(this.url)
			dialog = this.browser.querySelector("#dear_user_dialog")
			yield dialog.isPresent().must.then.be.false()
		})
	})

	describe("/topics/:id", function() {
		beforeEach(acceptBeta)

		it("must show initiative in voting to anonymous user", function*() {
			var end = new Date(Date.now() + 90 * DAY)
			var res

			res = yield this.api("/api/users/self/topics", {
				method: "POST",

				json: {
					"description": "<!DOCTYPE HTML><html><body><h1>Automation Proposal</h1><br><p>More automated tests!</p></body></html>",
					"visibility": "public",
					"endsAt": end,
					"contact": {"name": "", "email": "", "phone": ""}
				}
			})

			var initiative = res.body.data
			var url = "/api/users/self/topics/" + initiative.id

			// API seems to need another PUT to really update visibility.
			res = yield this.api(url, {
				method: "PUT",
				json: {"visibility": "public"}
			})

			res = yield this.api(url + "/votes", {
				method: "POST",

				json: {
					"options": [{"value": "Yes"}, {"value": "No"}],
					"delegationIsAllowed": false,
					"endsAt": end,
					"type": "regular",
					"authType": "hard"
				}
			})

			yield this.browser.get(this.url + "/topics/" + initiative.id)
			var body = yield this.browser.body.textContent
			body.must.include("Anna sellele algatusele oma allkiri!")
		})
	})
})

function* acceptBeta() {
	var url = yield this.browser.getCurrentUrl()
	if (!~url.indexOf(this.url)) yield this.browser.get(this.url)

	var browser = this.browser.manage()
	yield browser.addCookie("dearuser", "dearuser", "/", ".rahvaalgatus.ee")
}

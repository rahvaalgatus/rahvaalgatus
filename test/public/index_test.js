var _ = require("lodash")
var Url = require("url")
var Config = require("root/config/test")
var Moment = require("moment")
var TOKEN = Config.sessions[0]

var DEFAULT_INITIATIVE = {
	"description": "<!DOCTYPE HTML><html><body><h1>Automation Proposal</h1><br><p>More automated tests!</p></body></html>",
	"visibility": "public",
	"endsAt": Moment().startOf("day").add(90, "days").toDate(),
	"contact": {"name": "", "email": "", "phone": ""}
}

if (process.env.TEST.match(/\bui\b/))
describe("Rahvaalgatus", function() {
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

	describe("/topics/new", function() {
		beforeEach(signIn)
		beforeEach(acceptBeta)

		it("must create new discussion", function*() {
			var query = this.browser.querySelector.bind(this.browser)
			var tomorrow = Moment().startOf("day").add(1, "day").toDate()

			yield this.browser.get(this.url + "/topics/new")

			// An URL inside the <label> interferes with clicking. Workaroun for now.
			yield sleep(500)
			yield this.browser.eval(function() {
				document.querySelector("label[for=check]").click()
			})

			yield this.browser.querySelector(".step1-buttons .green-button").click()

			yield sleep(500)
			yield query(`a[data-date="${formatDate(tomorrow)}"]`).click()
			yield query(".step2-button .blue-button").click()

			yield sleep(1000)
			yield query(".step3-button .blue-button").click()

			var url = Url.parse(yield this.browser.getCurrentUrl())
			var id = _.last(url.pathname.split("/"))

			var res = yield this.api(`/api/users/self/topics/${id}`)
			var initiative = res.body.data
			initiative.status.must.equal("inProgress")
			initiative.visibility.must.equal("private")
			initiative.endsAt.must.equal(formatTime(Moment(tomorrow).endOf("day")))
		})
	})

	describe("/topics/:id", function() {
		beforeEach(acceptBeta)

		it("must send discussion to voting", function*() {
			var query = this.browser.querySelector.bind(this.browser)
			var tomorrow = Moment().startOf("day").add(1, "day").toDate()
			var tomorrowString = formatDate(tomorrow)
			yield signIn.call(this)

			var res = yield this.api("/api/users/self/topics", {
				method: "POST",
				json: DEFAULT_INITIATIVE
			})

			var initiative = res.body.data, id = initiative.id
			yield this.browser.get(this.url + "/topics/" + id)

			yield sleep(500)
			yield query(".collect-signatures a").click()

			yield sleep(500)
			yield query(`.deadline-date a[data-date="${tomorrowString}"]`).click()
			yield query(".admin-role-cal .sign-in a").click()

			yield sleep(500)
			res = yield this.api(`/api/users/self/topics/${id}`)
			initiative = res.body.data

			var voteId = initiative.vote.id
			res = yield this.api(`/api/users/self/topics/${id}/votes/${voteId}`)
			var vote = res.body.data

			vote.endsAt.must.equal(formatTime(Moment(tomorrow).endOf("day")))
		})

		it("must show initiative in voting to anonymous user", function*() {
			var res = yield this.api("/api/users/self/topics", {
				method: "POST",
				json: DEFAULT_INITIATIVE
			})

			var initiative = res.body.data
			res = yield this.api(`/api/users/self/topics/${initiative.id}/votes`, {
				method: "POST",

				json: {
					"options": [{"value": "Yes"}, {"value": "No"}],
					"delegationIsAllowed": false,
					"endsAt": Moment().startOf("day").add(90, "days").toDate(),
					"type": "regular",
					"authType": "hard"
				}
			})

			yield this.browser.get(this.url + "/topics/" + initiative.id)
			yield sleep(500)
			var body = yield this.browser.body.textContent
			body.must.include("Anna sellele algatusele oma allkiri!")
		})
	})
})

function* acceptBeta() {
	yield ensureAt(this.browser, this.url)

	var browser = this.browser.manage()
	yield browser.addCookie("dearuser", "dearuser", "/", ".rahvaalgatus.ee")
}

function* signIn() {
	yield ensureAt(this.browser, this.url)

	yield this.browser.eval(function(token) {
		window.localStorage.setItem("citizenos.accessToken", JSON.stringify(token))
	}, TOKEN)
}

function* ensureAt(browser, url) {
	if (!~(yield browser.getCurrentUrl()).indexOf(url)) yield browser.get(url)
}

function sleep(timeout) { return (fn) => setTimeout(fn, timeout) }
function formatDate(date) { return Moment(date).format("YYYY-MM-DD") }
function formatTime(time) { return time.toISOString() }

/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var I18n = require("root/lib/i18n")
var DateFns = require("date-fns")
var formatIsoDate = I18n.formatDate.bind(null, "iso")
var {SigningView} = require("root/views/initiatives/read_page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var lang = req.lang
	var signatureCountsByDate = attrs.signatureCountsByDate
	var signatureCountsByAge = attrs.signatureCountsByAge

	return <Page
		page="demo-signatures"
		class="demo-signatures-page"
		title={t("DEMO_SIGNATURES_TITLE")}
		navless
		req={req}>
		<script src="/assets/html5.js" />
		<script src="/assets/hwcrypto.js" />

		<header class="header-section text-header"><center>
			<h1>{t("DEMO_SIGNATURES_HEADER")}</h1>

			<div class="video">
				<iframe
					width="480"
					height="270"
					src="https://www.youtube.com/embed/rgpo1zVvpcM"
					frameborder="0"
					allowfullscreen
				/>
			</div>
		</center></header>

		<section id="intro" class="primary-section text-section"><center>

			{Jsx.html(I18n.markdown(lang, "demo_signatures"))}
		</center></section>

		<section id="sign" class="secondary-section text-section"><center>
			<h2 class="subheading">Allkirjasta</h2>

			{Jsx.html(I18n.markdown(lang, "demo_signatures_sign"))}

			<div id="sign-form">
				<SigningView
					req={req}
					t={t}
					action="/demo-signatures"
				/>
			</div>

			<div id="statistics">
				<h3 class="subsubheading">Allkirjade ajalugu</h3>

				<StatisticsViewByDate
					signatureCountsByDate={signatureCountsByDate}
				/>

				<StatisticsViewByAge
					signatureCountsByAge={signatureCountsByAge}
				/>
			</div>
		</center></section>
	</Page>
}

function StatisticsViewByDate(attrs) {
	var today = new Date
	var signatureCountsByDate = attrs.signatureCountsByDate
	var maxSignatures = _.max(_.values(signatureCountsByDate)) || 0
	var week = _.reverse(_.times(7, (i) => DateFns.addDays(today, -i)))

	return <svg
		class="signatures-by-date"
		xmlns="http://www.w3.org/2000/svg"
		version="1.1"
		width="300"
		height="150"
		viewBox="0 0 300 150"
	>
		<g transform="translate(10 10)">{week.map(function(date, i) {
			var maxHeight = 80
			var signatureCount = signatureCountsByDate[formatIsoDate(date)] || 0
			var height = Math.max(maxHeight * signatureCount / maxSignatures || 0, 5)

			return <g
				transform={`translate(${40 * i} 0)`}
				class={"day" + (DateFns.isSameDay(today, date) ? " today" : "")}
			>
				<text
					x="10"
					y={maxHeight - height}
					class="count"
				>
					<tspan
						text-align="center"
						text-anchor="middle"
						dominant-baseline="middle"
					>{signatureCount}</tspan>
				</text>

				<rect
					x="0"
					y={10 + maxHeight - height}
					class="bar"
					width="20"
					height={height}
					ry="5"
				/>

				<text
					class="date"
					x="10"
					y={10 + maxHeight + 20}
				>
					<tspan
						text-align="center"
						text-anchor="middle"
					>{I18n.formatDate("date-month", date)}
					</tspan>
				</text>
			</g>
		})}</g>
	</svg>
}

function StatisticsViewByAge(attrs) {
	var signatureCountsByAge = attrs.signatureCountsByAge

	var monthCount = 12 * 4 + 1
	var monthWidth = 580 / monthCount
	var monthPadding = 3
	var maxSignatures = _.max(_.values(signatureCountsByAge)) || 0

	return <svg
		class="signatures-by-age"
		xmlns="http://www.w3.org/2000/svg"
		version="1.1"
		width="600"
		height="150"
		viewBox="0 0 600 150"
	>
		<g transform="translate(10 10)">{_.times(monthCount, function(i) {
			var age = 16 * 12 + i
			var signatureCount = signatureCountsByAge[age] || 0
			var maxHeight = 80
			var height = Math.max(maxHeight * signatureCount / maxSignatures || 0, 5)

			return <g
				transform={`translate(${monthWidth * i} 0)`}
				class={"month" + (age % 12 == 0 ? " full-year" : "")}
				data-age-in-months={age}
			>
				{signatureCount > 0 ? <text
					x={(monthWidth - monthPadding) / 2}
					y={maxHeight - height}
					class="count"
				>
					<tspan
						text-align="center"
						text-anchor="middle"
						dominant-baseline="middle"
					>{signatureCount}</tspan>
				</text> : null}

				<rect
					x="0"
					y={10 + maxHeight - height}
					class="bar"
					width={monthWidth - monthPadding}
					height={height}
					ry="0"
				/>

				{age % 12 == 0 ? <text
					class="age"
					x={(monthWidth - monthPadding) / 2}
					y={10 + maxHeight + 20}
				>
					<tspan
						text-align="center"
						text-anchor="middle"
					>{age / 12}</tspan>
				</text> : null}
			</g>
		})}</g>
	</svg>
}

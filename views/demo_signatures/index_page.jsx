/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var I18n = require("root/lib/i18n")
var DateFns = require("date-fns")
var Config = require("root/config")
var formatIsoDate = I18n.formatDate.bind(null, "iso")
var {SigningView} = require("root/views/initiatives/read_page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var signatureCounts = attrs.signatureCounts

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
		</center></header>

		<section id="intro" class="primary-section text-section"><center>
			<div class="video">
				<iframe
					width="480"
					height="270"
					src={Config.videoUrls[req.lang]}
					frameborder="0"
					allowfullscreen
				/>
			</div>

			<p>{t("DEMO_SIGNATURES_BODY_TEXT")}</p>

			<p>Nam nec consequat mi. Aenean vitae orci elit. Sed non finibus risus. Ut feugiat enim nec dolor scelerisque venenatis. Donec urna felis, tristique sit amet libero sed, ultricies ullamcorper dolor. Pellentesque sed ullamcorper nisi. Phasellus pretium tristique nunc eget tempus. Donec eget magna lacinia, iaculis purus nec, accumsan quam. Pellentesque consectetur magna ut pretium tempus. Aenean iaculis justo erat, a viverra diam pulvinar non. Donec ac urna purus. Vestibulum nec nulla efficitur, molestie leo in, aliquet orci. Donec facilisis porta sapien quis viverra. Maecenas at eros et urna ultricies suscipit in blandit ex.</p>

			<p>Praesent convallis quam ac nisi facilisis hendrerit. Donec consectetur, tellus ac mattis dignissim, ipsum purus vehicula diam, at venenatis felis ante vel turpis. Donec interdum imperdiet nisi, in posuere nulla finibus at. Duis ut tortor faucibus, pulvinar lorem quis, imperdiet dolor. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget nisl ac mauris malesuada pellentesque vel posuere dolor. Etiam rutrum volutpat nulla vitae posuere. Proin nec aliquam sem. Proin dictum sollicitudin risus, dictum elementum ligula pulvinar nec. In iaculis auctor mi, ut pharetra odio egestas sed. Sed aliquet velit fringilla lectus ultrices, vel laoreet risus pulvinar. Proin tempus fringilla ligula et sodales. Mauris aliquet lacus et urna porta porttitor.</p>
		</center></section>

		<section id="sign" class="secondary-section text-section"><center>
			<h2 class="subheading">Allkirjasta</h2>

			<p>Nam nec consequat mi. Aenean vitae orci elit. Sed non finibus risus. Ut feugiat enim nec dolor scelerisque venenatis. Donec urna felis, tristique sit amet libero sed, ultricies ullamcorper dolor.</p>

			<div id="sign-form">
				<SigningView
					req={req}
					t={t}
					action="/demo-signatures"
				/>
			</div>

			<div id="statistics">
				<h3 class="subsubheading">Allkirjade ajalugu</h3>
				<StatisticsView signatureCounts={signatureCounts} />
			</div>
		</center></section>
	</Page>
}

function StatisticsView(attrs) {
	var today = new Date
	var signatureCounts = attrs.signatureCounts
	var maxSignatures = _.max(_.values(signatureCounts)) || 0
	var week = _.reverse(_.times(7, (i) => DateFns.addDays(today, -i)))

	return <svg
		xmlns="http://www.w3.org/2000/svg"
		version="1.1"
		width="300"
		height="150"
		viewBox="0 0 300 150"
	>
		<g transform="translate(10 10)">{week.map(function(date, i) {
			var maxHeight = 80
			var signatureCount = signatureCounts[formatIsoDate(date)] || 0
			var height = Math.max(maxHeight * signatureCount / maxSignatures, 5)

			return <g
				transform={`translate(${40 * i} 0)`}
				class={"day " + (DateFns.isSameDay(today, date) ? "today" : "")}
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
					stroke-width=".22914"
				/>

				<text
					class="date"
					x="10"
					y={10 + maxHeight + 20}
					stroke-width=".26458"
					word-spacing="0px"
					style="line-height:1.25"
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

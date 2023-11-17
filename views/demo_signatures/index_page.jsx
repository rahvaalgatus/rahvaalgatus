/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var I18n = require("root/lib/i18n")
var DateFns = require("date-fns")
var EidView = require("../eid_view")
var formatIsoDate = I18n.formatDate.bind(null, "iso")

module.exports = function(attrs) {
	var {req} = attrs
	var {t} = req
	var {lang} = req
	var {signatureCount} = attrs
	var {signatureCountsByDate} = attrs

	return <Page
		page="demo-signatures"
		class="demo-signatures-page"
		title={t("demo_signatures_page.title")}
		headless
		req={req}>
		<script src="/assets/html5.js" />
		<script src="/assets/hwcrypto.js" />

		<header class="header-section text-header"><center>
			<a href="https://demokraatia.rahvaalgatus.ee" class="home">
				<img src="/assets/dtv.svg" alt={t("demo_signatures_page.dtv")} />
			</a>

			<h1>{t("demo_signatures_page.title")}</h1>

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

		<section class="primary-section text-section"><center>
			{Jsx.html(I18n.markdown(lang, "demo_signatures_prologue"))}
		</center></section>

		<section class="secondary-section text-section"><center>
			{Jsx.html(I18n.markdown(lang, "demo_signatures_sign"))}
		</center></section>

		<section id="sign-section" class="secondary-section"><center>
			<EidView
				t={t}
				centered
				csrfToken={req.csrfToken}
				url="/demo-signatures"
				id="create-signature-form"
				action="sign"
				submit={t("initiative_page.signing_section.eid_view.sign_button")}
				pending={t("initiative_page.signing_section.eid_view.signing")}
			/>
		</center></section>

		<section class="secondary-section text-section"><center>
			<div id="statistics">
				<div id="signature-count">
					{Jsx.html(t("demo_signatures_page.n_tried", {count: signatureCount}))}
				</div>

				{_.any(signatureCountsByDate) ? <figure id="signatures-by-date">
					<StatisticsViewByDate
						signatureCountsByDate={signatureCountsByDate}
					/>

					<figcaption>
						{t("demo_signatures_page.signatures_by_date")}
					</figcaption>
				</figure> : null}
			</div>
		</center></section>

		<section id="intro" class="primary-section text-section"><center>
			{Jsx.html(I18n.markdown(lang, "demo_signatures_epilogue"))}
		</center></section>
	</Page>
}

function StatisticsViewByDate(attrs) {
	var today = new Date
	var {signatureCountsByDate} = attrs
	var maxSignatures = _.max(_.values(signatureCountsByDate)) || 0
	var week = _.reverse(_.times(7, (i) => DateFns.addDays(today, -i)))

	return <svg
		xmlns="http://www.w3.org/2000/svg"
		version="1.1"
		width="300"
		height="150"
		viewBox="0 0 300 110"
	>
		<g transform="translate(10 10)">{week.map(function(date, i) {
			var maxHeight = 80
			var signatureCount = signatureCountsByDate[formatIsoDate(date)] || 0
			var height = Math.max(maxHeight * signatureCount / maxSignatures || 0, 5)

			return <g
				transform={`translate(${40 * i} 0)`}
				class={"day" + (DateFns.isSameDay(today, date) ? " today" : "")}
			>
				{signatureCount > 0 ? <text
					x="10"
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
					x="5"
					y={10 + maxHeight - height}
					class="bar"
					width="10"
					height={height}
					ry="2"
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

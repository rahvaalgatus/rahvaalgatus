/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var Config = require("root/config")
var {SigningView} = require("root/views/initiatives/read_page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t

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
		</center></section>
	</Page>
}

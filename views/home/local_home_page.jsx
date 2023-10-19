/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var {Fragment} = Jsx
var Page = require("../page")
var {Section} = require("../page")
var {Flash} = require("../page")
var {InitiativeBoxesView} = require("../initiatives/index_page")
var {CallToActionsView} = require("../home_page")
var LOCAL_GOVERNMENTS_BY_COUNTY =
	require("root/lib/local_governments").BY_COUNTY
var {javascript} = require("root/lib/jsx")
var {groupInitiatives} = require("../home_page")

module.exports = function(attrs) {
	var {t} = attrs
	var {req} = attrs
	var {initiativeCounts} = attrs
	var initiativesByPhase = groupInitiatives(attrs.initiatives)

	return <Page page="local-home" req={req}>
		<script src="/assets/local.js" />

		<Section id="welcome" class="primary-section">
			<Flash flash={req.flash} />

			<h1>{t("LOCAL_HOME_PAGE_WELCOME_TITLE")}</h1>

			<p class="welcome-paragraph">
				{Jsx.html(t("LOCAL_HOME_PAGE_HEADER_TEXT"))}
			</p>

			<CallToActionsView req={req} t={t} />
		</Section>

		<section id="map-section" class="secondary-section">
			<div id="map-location" class="map-location">
				<select class="form-select">
					<option value="all">Kogu Eesti</option>

					{_.map(LOCAL_GOVERNMENTS_BY_COUNTY, (govs, county) => (
						<optgroup label={county + " maakond"}>{govs.map(([id, name]) => (
							<option value={id}>
								{name}
							</option>
						))}</optgroup>
					))}
				</select>
			</div>

			<div id="map" />

			<div id="map-legend" class="map-legend">
				<h2>Algatused</h2>

				<ol id="initiatives-legend">
					<li><label>
						<Checkbox name="phase" value="edit" checked />
						{t("LOCAL_HOME_PAGE_MAP_LEGEND_IN_EDIT")}
					</label></li>

					<li><label>
						<Checkbox name="phase" value="sign" checked />
						{t("LOCAL_HOME_PAGE_MAP_LEGEND_IN_SIGN")}
					</label></li>

					<li><label>
						<Checkbox name="phase" value="government" checked />
						{t("LOCAL_HOME_PAGE_MAP_LEGEND_IN_GOVERNMENT")}
					</label></li>

					<li><label>
						<Checkbox name="phase" value="archive" checked />
						{t("LOCAL_HOME_PAGE_MAP_LEGEND_IN_ARCHIVE")}
					</label></li>
				</ol>

				<h2>Sündmused</h2>
				<ol id="events-legend">
					<li><label>
						<Checkbox name="event" value="dtv" checked />
						{t("LOCAL_HOME_PAGE_MAP_LEGEND_DTV")}
					</label></li>

					<li><label>
						<Checkbox name="event" value="dialog" checked />
						{t("LOCAL_HOME_PAGE_MAP_LEGEND_DIALOG")}
					</label></li>
				</ol>
			</div>

			<script>{javascript`
				var Local = require("@rahvaalgatus/local")

				Local.newMap(
					document.getElementById("map"),
					${initiativeCounts},
					document.getElementById("map-location"),
					document.getElementById("map-legend")
				)
			`}</script>
		</section>

		<Section id="initiatives" class="secondary-section initiatives-section">
			{initiativesByPhase.edit ? <Fragment>
				<h2>{t("EDIT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="edit"
					id="initiatives-in-edit"
					initiatives={initiativesByPhase.edit}
				/>
			</Fragment> : null}

			{initiativesByPhase.sign ? <Fragment>
				<h2>{t("SIGN_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="sign"
					id="initiatives-in-sign"
					initiatives={initiativesByPhase.sign}
				/>
			</Fragment> : null}

			{initiativesByPhase.signUnsent ? <Fragment>
				<h2>{t("HOME_PAGE_SIGNED_TITLE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="sign"
					id="initiatives-in-sign-unsent"
					initiatives={initiativesByPhase.signUnsent}
				/>
			</Fragment> : null}

			{initiativesByPhase.government ? <Fragment>
				<h2>{t("GOVERNMENT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="government"
					id="initiatives-in-government"
					initiatives={initiativesByPhase.government}
				/>
			</Fragment> : null}

			{initiativesByPhase.done ? <Fragment>
				<h2>{t("DONE_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="done"
					id="initiatives-in-done"
					initiatives={initiativesByPhase.done}
				/>
			</Fragment> : null}

			<p id="see-archive">
				{Jsx.html(t("HOME_PAGE_SEE_ARCHIVE", {url: "/initiatives"}))}
			</p>
		</Section>
	</Page>
}

function Checkbox(attrs) {
	return <span class="checkbox" data-name={attrs.name} data-value={attrs.value}>
		<input
			type="checkbox"
			name={attrs.name}
			value={attrs.value}
			checked={attrs.checked}
		/>

		<span class="check" />
	</span>
}

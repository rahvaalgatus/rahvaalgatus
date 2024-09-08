/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Qs = require("qs")
var Jsx = require("j6pack")
var I18n = require("root/lib/i18n")
var Range = require("strange")
var DateFns = require("date-fns")
var Page = require("../page")
var Initiative = require("root/lib/initiative")
var Filtering = require("root/lib/filtering")
var Css = require("root/lib/css")
var {Section} = require("../page")
var {DateView} = Page
var {SortButton} = Page
var {InitiativeBadgeView} = require("./initiative_page")
var {getSignatureThreshold} = require("root/lib/initiative")
var {javascript} = require("root/lib/jsx")
var formatIsoDate = require("root/lib/i18n").formatDate.bind(null, "iso")
var getWeight = _.property("weight")
var {PARLIAMENT_DECISIONS} = require("root/lib/initiative")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
var {PHASES} = require("root/lib/initiative")
var PARLIAMENT_COMMITTEES = require("root/lib/parliament_committees")
var PARLIAMENT_COMMITTEE_IDS =
	_.keys(_.filterValues(PARLIAMENT_COMMITTEES, (c) => c.permanent))

module.exports = function({
	t,
	req,
	flash,
	filters,
	order,
	initiatives,
	parliamentCommittees
}) {
	var {lang} = req
	var [orderBy, orderDir] = order
	var filterQuery = serializeFilters(filters)
	var initiativesPath = req.baseUrl

	var query = _.defaults({
		order: orderBy ? (orderDir == "asc" ? "" : "-") + orderBy : undefined
	}, filterQuery)

	var colSpan = 8

	return <Page
		page="initiatives"
		title={t("initiatives_page.title")}
		req={req}

		links={[{
			rel: "alternate",
			type: "application/atom+xml",
			title: t("ATOM_INITIATIVE_EVENTS_FEED_TITLE"),
			href: "/initiative-events.atom"
		}]}
	>
		{
			// When deleting an initiative, people get redirected here.
		}
		{flash("notice") ? <Section class="secondary-section">
			<p class="flash notice">{flash("notice")}</p>
		</Section> : null}

		<section id="initiatives-section" class="secondary-section">
			<h1>{t("initiatives_page.title")}</h1>

			<table id="initiatives">
				<caption><div>
					<div class="summary">
						{initiatives.length > 0 ? <div class="total">{anyDefined(filters) ? <>
							{Jsx.html(initiatives.length == 1
								? t("initiatives_page.caption.filtered_total_1")
								: t("initiatives_page.caption.filtered_total_n", {
									count: initiatives.length
								})
							)}
							{" "}
							<a
								href={initiativesPath + Qs.stringify({
									order: orderBy
										? (orderDir == "asc" ? "" : "-") + orderBy
										: undefined
								}, {addQueryPrefix: true})}

								class="link-button reset-filters-button"
							>
								{Jsx.html(t("initiatives_page.caption.view_all_button"))}
							</a>.
						</> : Jsx.html(initiatives.length == 1
							? t("initiatives_page.caption.total_1")
							: t("initiatives_page.caption.total_n", {count: initiatives.length})
						)}</div> : null}

						<CurrentFiltersView t={t} lang={lang} filters={filters} />
					</div>

					<div class="configuration">
						<FiltersView
							t={t}
							lang={lang}
							filters={filters}
							path={initiativesPath}
							order={order}
							parliamentCommittees={parliamentCommittees}
						/>

						{initiatives.length > 0 ? <a
							href={initiativesPath + ".csv" + Qs.stringify(query, {
								addQueryPrefix: true,
								arrayFormat: "brackets"
							})}

							class="csv-button"
						>
							{t("initiatives_page.table.download_csv_button")}
						</a> : null}

					</div>
				</div></caption>

				<thead>
					<tr title={t("initiatives_page.table.sort_tooltip")}>
						<th>
							<SortButton
								path={initiativesPath}
								query={filterQuery}
								name="title"
								sorted={orderBy == "title" ? orderDir : null}
							>
								{t("initiatives_page.table.title_column")}
							</SortButton>

							<small>
								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="destination"
									sorted={orderBy == "destination" ? orderDir : null}
								>
									{t("initiatives_page.table.destination_column")}
								</SortButton>

								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="author"
									sorted={orderBy == "author" ? orderDir : null}
								>
									{t("initiatives_page.table.author_column")}
								</SortButton>
							</small>
						</th>

						<th class="phase-column">
							<SortButton
								path={initiativesPath}
								query={filterQuery}
								name="phase"
								sorted={orderBy == "phase" ? orderDir : null}
							>
								{t("initiatives_page.table.phase_column")}
							</SortButton>
						</th>

						<th class="edit-phase-column">
							<span class="column-name">
								{t("initiatives_page.table.edit_phase_column")}
							</span>

							<small>
								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="published-at"
									direction="desc"
									sorted={orderBy == "published-at" ? orderDir : null}
								>
									{t("initiatives_page.table.start_column")}
								</SortButton>
							</small>
						</th>

						<th colspan="2" class="sign-phase-column">
							<span class="column-name">
								{t("initiatives_page.table.sign_phase_column")}
							</span>

							<small>
								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="signing-started-at"
									direction="desc"
									sorted={orderBy == "signing-started-at" ? orderDir : null}
								>
									{t("initiatives_page.table.start_column")}
								</SortButton>

								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="signing-ended-at"
									direction="desc"
									sorted={orderBy == "signing-ended-at" ? orderDir : null}
								>
									{t("initiatives_page.table.end_column")}
								</SortButton>

								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="signature-count"
									direction="desc"
									sorted={orderBy == "signature-count" ? orderDir : null}
								>
									{t("initiatives_page.table.signatures_column")}
								</SortButton>

								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="last-signed-at"
									direction="desc"
									sorted={orderBy == "last-signed-at" ? orderDir : null}
								>
									{t("initiatives_page.table.last_signed_column")}
								</SortButton>
							</small>
						</th>

						<th class="proceedings-phase-column">
							<span class="column-name">
								{t("initiatives_page.table.parliament_phase_column")}
							</span>

							<small>
								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="proceedings-started-at"
									direction="desc"
									sorted={orderBy == "proceedings-started-at" ? orderDir : null}
								>
									{t("initiatives_page.table.start_column")}
								</SortButton>

								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="proceedings-ended-at"
									direction="desc"
									sorted={orderBy == "proceedings-ended-at" ? orderDir : null}
								>
									{t("initiatives_page.table.end_column")}
								</SortButton>

								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="proceedings-handler"
									direction="asc"
									sorted={orderBy == "proceedings-handler" ? orderDir : null}
								>
									{t("initiatives_page.table.proceedings_handler_column")}
								</SortButton>
							</small>
						</th>
					</tr>
				</thead>

				<tbody class="graphs"><tr><td colspan={colSpan}>
					<GraphsView
						t={t}
						lang={lang}
						initiatives={initiatives}
						path={initiativesPath}
						query={query}
					/>
				</td></tr></tbody>

				{initiatives.length == 0 ? <tbody class="empty"><tr>
					<td colspan={colSpan}>{anyDefined(filters) ? <>
						<p>
							{t("initiatives_page.table.no_initiatives_with_filters")}
						</p>

						<p>
							<a href={initiativesPath + Qs.stringify({
								order: orderBy
									? (orderDir == "asc" ? "" : "-") + orderBy
									: undefined
							}, {addQueryPrefix: true})} class="link-button">
								{t("initiatives_page.table.view_all_button")}
							</a></p>.
					</> : <p>{t("initiatives_page.table.no_initiatives")}</p>}</td>
				</tr></tbody> :

				_.map(groupInitiatives(orderBy, initiatives), (initiatives) => {
					var group = groupInitiative(orderBy, initiatives[0])

					var title =
						orderBy == "destination" ? t("DESTINATION_" + group) :
						orderBy == "phase" ? t("initiatives_page.phases." + group) :

						orderBy == "signing-started-at" ? (
							group || t("initiatives_page.table.signing_started_at_ungrouped")
						) :

						orderBy == "signing-ended-at" ? (
							group || t("initiatives_page.table.signing_ended_at_ungrouped")
						) :

						orderBy == "last-signed-at" ? (
							group || t("initiatives_page.table.last_signed_ungrouped")
						) :

						orderBy == "proceedings-started-at" ? (
							group ||
							t("initiatives_page.table.proceedings_started_at_ungrouped")
						) :

						orderBy == "proceedings-ended-at" ? (
							group ||
							t("initiatives_page.table.proceedings_ended_at_ungrouped")
						) :

						orderBy == "proceedings-handler" ? (
							group && nameProceedingsHandler(lang, group)
						) :

						group

					return <InitiativeGroupView
						t={t}
						lang={lang}
						title={title}
						initiatives={initiatives}
					/>
				})}
			</table>
		</section>
	</Page>
}

function FiltersView({
	t,
	lang,
	filters,
	path,
	order: [orderBy, orderDir],
	parliamentCommittees
}) {
	var extraParliamentCommittees =
		_.difference(parliamentCommittees, PARLIAMENT_COMMITTEE_IDS)

	return <details id="filters">
		<summary>
			<span class="open-text">{anyDefined(filters)
				? t("initiatives_page.filters.open_button_with_filters")
				: t("initiatives_page.filters.open_button")
			}</span>
		</summary>

		<form method="get" action={path}>
			<label>
				<span>{t("initiatives_page.filters.phase_label")}</span>

				<select name="phase" class="form-select">
					<option value="" selected={filters.phase == null}>
						{t("initiatives_page.filters.phases.all")}
					</option>

					<hr />

					{PHASES.map((phase) => <option
						value={phase}
						selected={filters.phase == phase}
					>
						{t("initiatives_page.phases." + phase)}
					</option>)}
				</select>
			</label>

			<label>
				<span>{t("initiatives_page.filters.destination_label")}</span>

				<select name="destination" class="form-select">
					<option value="" selected={filters.destination == null}>
						{t("initiatives_page.filters.destination.all_label")}
					</option>

					<optgroup label={t("initiatives_page.filters.destination.national_group_label")}>
						<option
							value="parliament"
							selected={(filters.destination || []).includes("parliament")}
						>
							{t("initiatives_page.filters.destination.parliament_label")}
						</option>

						<option
							value="local"
							selected={(filters.destination || []).includes("local")}
						>
							{t("initiatives_page.filters.destination.local_label")}
						</option>
					</optgroup>

					<optgroup label={t("initiatives_page.filters.destination.local_group_label")}>{_.map(LOCAL_GOVERNMENTS.SORTED_BY_NAME, ({name}, id) => <option
						value={id}
						selected={(filters.destination || []).includes(id)}
					>{name}</option>)}</optgroup>
				</select>
			</label>

			<label>
				<span>
					{t("initiatives_page.filters.published_since_label")}
				</span>

				<input
					type="date"
					name="published-on>"
					class="form-input"

					value={
						filters.publishedOn &&
						filters.publishedOn.begin &&
						formatIsoDate(filters.publishedOn.begin)
					}
				/>
			</label>

			<label>
				<span>{t("initiatives_page.filters.published_until_label")}</span>

				<input
					type="date"
					name="published-on<"
					class="form-input"

					value={
						filters.publishedOn &&
						filters.publishedOn.end &&
						formatIsoDate(DateFns.addDays(filters.publishedOn.end, -1))
					}
				/>
			</label>

			<label>
				<span>
					{t("initiatives_page.filters.signing_started_since_label")}
				</span>

				<input
					type="date"
					name="signing-started-on>"
					class="form-input"

					value={
						filters.signingStartedOn &&
						filters.signingStartedOn.begin &&
						formatIsoDate(filters.signingStartedOn.begin)
					}
				/>
			</label>

			<label>
				<span>
					{t("initiatives_page.filters.signing_started_until_label")}
				</span>

				<input
					type="date"
					name="signing-started-on<"
					class="form-input"

					value={
						filters.signingStartedOn &&
						filters.signingStartedOn.end &&
						formatIsoDate(DateFns.addDays(filters.signingStartedOn.end, -1))
					}
				/>
			</label>

			<label>
				<span>
					{t("initiatives_page.filters.last_signed_since_label")}
				</span>

				<input
					type="date"
					name="last-signed-on>"
					class="form-input"

					value={
						filters.lastSignedOn &&
						filters.lastSignedOn.begin &&
						formatIsoDate(filters.lastSignedOn.begin)
					}
				/>
			</label>

			<label>
				<span>
					{t("initiatives_page.filters.proceedings_started_since_label")}
				</span>

				<input
					type="date"
					name="proceedings-started-on>"
					class="form-input"

					value={
						filters.proceedingsStartedOn &&
						filters.proceedingsStartedOn.begin &&
						formatIsoDate(filters.proceedingsStartedOn.begin)
					}
				/>
			</label>

			<label>
				<span>
					{t("initiatives_page.filters.proceedings_started_until_label")}
				</span>

				<input
					type="date"
					name="proceedings-started-on<"
					class="form-input"

					value={
						filters.proceedingsStartedOn &&
						filters.proceedingsStartedOn.end &&
						formatIsoDate(DateFns.addDays(filters.proceedingsStartedOn.end, -1))
					}
				/>
			</label>

			<label>
				<span>
					{t("initiatives_page.filters.proceedings_ended_since_label")}
				</span>

				<input
					type="date"
					name="proceedings-ended-on>"
					class="form-input"

					value={
						filters.proceedingsEndedOn &&
						filters.proceedingsEndedOn.begin &&
						formatIsoDate(filters.proceedingsEndedOn.begin)
					}
				/>
			</label>

			<label>
				<span>
					{t("initiatives_page.filters.proceedings_ended_until_label")}
				</span>

				<input
					type="date"
					name="proceedings-ended-on<"
					class="form-input"

					value={
						filters.proceedingsEndedOn &&
						filters.proceedingsEndedOn.end &&
						formatIsoDate(DateFns.addDays(filters.proceedingsEndedOn.end, -1))
					}
				/>
			</label>

			<label>
				<span>{t("initiatives_page.filters.proceedings_handler_label")}</span>

				<select name="proceedings-handler" class="form-select">
					<option value="" selected={filters.proceedingsHandler == null}>
						{t("initiatives_page.filters.proceedings_handler.all_label")}
					</option>

					<option
						value="local"
						selected={filters.proceedingsHandler == "local"}
					>
						{t("initiatives_page.filters.proceedings_handler.local_label")}
					</option>

					<hr />

					<optgroup label={t("initiatives_page.filters.proceedings_handler.parliament_group_label")}>
						{PARLIAMENT_COMMITTEE_IDS.map((committee) => <option
							value={committee}
							selected={filters.proceedingsHandler == committee}
						>
							{I18n.nameParliamentCommittee(lang, committee)}
						</option>)}

						{extraParliamentCommittees.map((committee) => <option
							value={committee}
							selected={filters.proceedingsHandler == committee}
						>
							{committee}
						</option>)}
					</optgroup>

					<optgroup label={t("initiatives_page.filters.proceedings_handler.local_group_label")}>{_.map(LOCAL_GOVERNMENTS.SORTED_BY_NAME, ({name}, id) => <option
						value={id}
						selected={filters.proceedingsHandler == id}
					>{name}</option>)}</optgroup>
				</select>
			</label>

			<label>
				<span>{t("initiatives_page.filters.proceedings_decision_label")}</span>

				<select name="proceedings-decision" class="form-select">
					<option value="" selected={filters.proceedingsDecision == null}>
						{t("initiatives_page.filters.proceedings_decision.all_label")}
					</option>

					<optgroup label={t("initiatives_page.filters.proceedings_decision.parliament_group_label")}>
						{PARLIAMENT_DECISIONS.map((decision) => <option
							value={decision}
							selected={filters.proceedingsDecision == decision}
						>
							{renderParliamentDecision(t, decision)}
						</option>)}
					</optgroup>
				</select>
			</label>

			<br />
			<button type="submit" class="blue-rounded-button">
				{t("initiatives_page.filters.filter_button")}
			</button>

			{anyDefined(filters) ? <>
				{" "}
				{t("initiatives_page.filters.or")}
				{" "}
				<a href={path + Qs.stringify({
					order: orderBy
						? (orderDir == "asc" ? "" : "-") + orderBy
						: undefined
				}, {addQueryPrefix: true})} class="link-button reset-filters-button">
					{t("initiatives_page.filters.reset_button")}
				</a>.
			</> : null}

			{filters.external != null ? <input
				type="hidden"
				name="external"
				value={String(filters.external)}
			/> : null}

			{orderBy ? <input
				type="hidden"
				name="order"
				value={(orderDir == "asc" ? "" : "-") + orderBy}
			/> : null}
		</form>
	</details>
}

function CurrentFiltersView({t, lang, filters}) {
	var facets = _.intersperse([
		filters.id && <Filter name="Id">
			<strong>{filters.id.join(", ")}</strong>
		</Filter>,

		filters.phase && <Filter
			name={t("initiatives_page.caption.filters.phase_label")}
		>
			<ul>{filters.phase.map((phase) => <li>
				<strong>{t("initiatives_page.phases." + phase)}</strong>
			</li>)}</ul>
		</Filter>,

		filters.destination && <Filter
			name={t("initiatives_page.caption.filters.destination_label")}
		>
			<ul>{filters.destination.map((destination) => <li>
				<strong>{
					destination == "parliament"
					? t("initiatives_page.caption.filters.destination_parliament")
					: destination == "local"
					? t("initiatives_page.caption.filters.destination_local")
					: LOCAL_GOVERNMENTS[destination].name
				}</strong>
			</li>)}</ul>
		</Filter>,

		filters.publishedOn && <Filter
			name={t("initiatives_page.caption.filters.published_label")}
		>
			<DateRangeView range={filters.publishedOn} />
		</Filter>,

		filters.signingStartedOn && <Filter
			name={t("initiatives_page.caption.filters.signing_started_label")}
		>
			<DateRangeView range={filters.signingStartedOn} />
		</Filter>,

		filters.lastSignedOn && <Filter
			name={t("initiatives_page.caption.filters.last_signed_label")}
		>
			<DateRangeView range={filters.lastSignedOn} />
		</Filter>,

		filters.proceedingsStartedOn && <Filter
			name={t("initiatives_page.caption.filters.proceedings_started_label")}
		>
			<DateRangeView range={filters.proceedingsStartedOn} />
		</Filter>,

		filters.proceedingsEndedOn && <Filter
			name={t("initiatives_page.caption.filters.proceedings_ended_label")}
		>
			<DateRangeView range={filters.proceedingsEndedOn} />
		</Filter>,

		filters.proceedingsHandler && <Filter
			name={t("initiatives_page.caption.filters.proceedings_handler_label")}
		>
			<strong>{
				filters.proceedingsHandler in PARLIAMENT_COMMITTEES
				? I18n.nameParliamentCommittee(lang, filters.proceedingsHandler)
				: filters.proceedingsHandler in LOCAL_GOVERNMENTS
				? LOCAL_GOVERNMENTS[filters.proceedingsHandler].name
				: filters.proceedingsHandler == "local"
				? t("initiatives_page.caption.filters.proceedings_handler_local")
				: filters.proceedingsHandler
			}</strong>
		</Filter>,

		filters.proceedingsDecision && <Filter
			name={t("initiatives_page.caption.filters.proceedings_decision_label")}
		>
			<strong>
				{renderParliamentDecision(t, filters.proceedingsDecision)}
			</strong>
		</Filter>,

		filters.external != null ? <Filter
			name={t("initiatives_page.caption.filters.external_label")}
		>
			<strong>{filters.external
				? t("initiatives_page.caption.filters.external")
				: t("initiatives_page.caption.filters.nonexternal")
			}</strong>
		</Filter> : null
	])

	if (facets.length == 0) return null
	return <ul id="current-filters">{facets}</ul>

	function DateRangeView({range: {begin, end}}) {
		begin = begin && <strong><DateView date={begin} /></strong>
		end = end && <strong><DateView date={DateFns.addDays(end, -1)} /></strong>

		if (begin && end) return <>{begin}—{end}</>
		if (begin) return <>{begin}—</>
		if (end) return <>—{end}</>
		return null
	}

	function Filter({name}, children) {
		return <li class="filter">
			<span class="name">{name}</span> {children}
		</li>
	}
}

function InitiativeGroupView({t, lang, title, initiatives}) {
	var colSpan = 8

	return <tbody>
		<tr class="table-group-header">
			<th colspan={colSpan} scope="rowgroup">
				{title ? <h2>{title}</h2> : null}
			</th>
		</tr>

		{initiatives.map(function(initiative) {
			var authorNames = Initiative.authorNames(initiative)
			var proceedingsStartedAt = getProceedingsStartedAt(initiative)
			var proceedingsEndedAt = getProceedingsEndedAt(initiative)
			var proceedingsHandlers = getProceedingsHandlers(initiative)

			return <tr
				class="initiative"
				data-id={initiative.id}
				data-uuid={initiative.uuid}
			>
				<td class="title-column">
					<span class="destination">{initiative.destination
						? t("DESTINATION_" + initiative.destination)
						: ""
					}</span>

					<h3 lang="et" title={initiative.title}>
						<a href={Initiative.slugPath(initiative)}>
							{initiative.title}
						</a>

						<InitiativeBadgeView initiative={initiative} />
					</h3>

					<ul class="authors" title={authorNames.join(", ")}>
						{/* Adding comma to <li> to permit selecting it. */}
						{_.intersperse(authorNames.map((name, i, names) => <li>
							{name}{i + 1 < names.length ? "," : ""}
						</li>), " ")}
					</ul>
				</td>

				<td
					class="phase-column"
					title={t("initiatives_page.table.phase_column")}
				>
					<span class={"phase " + initiative.phase + "-phase"}>
						{t("initiatives_page.phases." + initiative.phase)}
					</span>
				</td>

				<td
					class="published-at-column edit-phase-column"
					title={t("initiatives_page.table.edit_phase_column")}
				>
					<DateView date={initiative.published_at} />
				</td>

				<td
					class="signing-started-at-column signing-ended-at-column sign-phase-column"
					title={t("initiatives_page.table.sign_phase_column")}
				>
					{initiative.signing_started_at
						? <DateView date={initiative.signing_started_at} />
						: null
					}

					{initiative.signing_started_at && initiative.signing_ends_at
						? "—" : ""
					}

					{initiative.signing_ends_at ? <DateView
						date={DateFns.addMilliseconds(initiative.signing_ends_at, -1)}
					/> : null}
				</td>

				<td
					class="signature-count-column sign-phase-column"
					title={t("initiatives_page.table.signatures_column")}
				>{initiative.phase != "edit" ? <>
					<SignatureProgressView
						t={t}
						initiative={initiative}
						signatureCount={initiative.signature_count}
					/>

					{(
						initiative.phase == "sign" &&
						initiative.last_signed_at
					)	? <p class="last-signed"><small>
						{Jsx.html(t("initiatives_page.table.last_signed_at", {
							date: <DateView date={initiative.last_signed_at} />
						}))}
					</small></p> : null}
				</> : null}</td>

				<td
					class="proceedings-started-at-column proceedings-ended-at-column proceedings-phase-column"
					title={t("initiatives_page.table.parliament_phase_column")}
				>
					{proceedingsStartedAt
						? <DateView date={proceedingsStartedAt} />
						: null
					}

					{proceedingsStartedAt && proceedingsEndedAt ? "—" : ""}
					{proceedingsEndedAt ? <DateView date={proceedingsEndedAt} /> : null}

					{proceedingsHandlers.length > 0 ? <p
						class="proceedings-handlers"
						title={t("initiatives_page.table.proceedings_handler_column")}
					>{proceedingsHandlers.map(
						nameProceedingsHandler.bind(null, lang)
					).join(", ")}</p> : null}

					{initiative.parliament_decision ? <p class="proceedings-decision">
						{renderParliamentDecision(t, initiative.parliament_decision)}.
					</p> : null}
				</td>
			</tr>
		})}
	</tbody>
}

function GraphsView({t, lang, initiatives, path, query}) {
	return <div class="graphs-view">
		<ProceedingsHandlersGraphView
			t={t}
			lang={lang}
			initiatives={initiatives}
			path={path}
			query={query}
		/>

		<TopSignedInitiativesGraphView
			t={t}
			initiatives={initiatives}
			path={path}
			query={query}
		/>
	</div>
}

var PIE_CHART_COLORS = [
	"#40A2E3",
	"#86A7FC",
	"#3468C0",
	"#0D9276",
	"#BBE2EC",
	"#FF9843",
	"#FFDD95",
	"#7BD3EA",
	"#A1EEBD",
	"#F6F7C4",
	"#F6D6D6",
	"#190482",
	"#7752FE",
	"#8E8FFA",
	"#C2D9FF",
	"#B5C18E",
	"#F7DCB9",
	"#DEAC80",
	"#B99470",
	"#FFF6E9",
]

function ProceedingsHandlersGraphView({t, lang, initiatives, path, query}) {
	var handlers = _.countBy(initiatives.flatMap(getProceedingsHandlers))
	handlers = _.sortBy(_.toEntries(handlers), _.second).reverse()
	if (handlers.length < 2) return null

	var sectors = handlers.map(([handler, count], i) => ({
		id: handler,
		title: handler == "null" ? null : nameProceedingsHandler(lang, handler),
		weight: count,
		class: "handler",
		color: PIE_CHART_COLORS[i] || "#ccc",

		href: path + Qs.stringify(_.defaults({
			"proceedings-handler": handler
		}, query), {addQueryPrefix: true})
	}))

	var groups = _.groupBy(sectors, ({id}) => (
		id in PARLIAMENT_COMMITTEES ? "parliament" : "local"
	))

	groups = _.map(groups, (sectors, group) => ({
		title: group == "parliament"
			? t("initiatives_page.graphs.proceedings_handler.parliament_ring_title")
			: t("initiatives_page.graphs.proceedings_handler.local_ring_title"),

		label: group == "parliament"
			? t("initiatives_page.graphs.proceedings_handler.parliament_ring_label")
			: t("initiatives_page.graphs.proceedings_handler.local_ring_label"),

		weight: _.sum(sectors.map(getWeight)),
		color: group == "parliament" ? "#1c71a2" : "#ffb237",
		sectors,

		href: path + Qs.stringify(_.defaults(group == "parliament"
			? {destination: "parliament"}
			: {"proceedings-handler": "local"}, query), {addQueryPrefix: true})
	}))

	return <figure id="handler-graph" class="graph">
		<figcaption><h2>
			{t("initiatives_page.graphs.proceeding_handlers_label")}
		</h2></figcaption>

		<div>
			<PieChartView
				sectors={groups}
				sectorRadius={40}
				sectorWidth={30}
			/>

			<table
				class="legend"
			>{sectors.slice(0, PARLIAMENT_COMMITTEE_IDS.length).map(({
				id,
				title,
				weight: count,
				color
			}) => <tr>
				<td class="color" style={`color: ${color}`} />
				<td class="count">{count}</td>

				<td class="title" title={title}>
					<a href={path + Qs.stringify(_.defaults({
						"proceedings-handler": id
					}, query), {addQueryPrefix: true})} class="link-button">
						{title}
					</a>
				</td>
			</tr>)}</table>
		</div>

		<script>{javascript`
			var el = document.getElementById("handler-graph")
			var slice = Function.call.bind(Array.prototype.slice)
			var legend = el.querySelector(".legend")
			var handlerSectors = el.querySelectorAll("svg .sector.handler")

			slice(handlerSectors).forEach(function(el, i) {
				el.addEventListener("mouseenter", function() {
					toggleLegendRow(i, true)
				})

				el.addEventListener("mouseleave", function() {
					toggleLegendRow(i, false)
				})
			})

			Array.prototype.forEach.call(legend.rows, function(el, i) {
				el.addEventListener("mouseenter", function() {
					toggleHandlerSector(i, true)
				})

				el.addEventListener("mouseleave", function() {
					toggleHandlerSector(i, false)
				})
			})

			function toggleLegendRow(i, highlight) {
				var row = legend.rows[i]
				if (row) row.classList.toggle("highlighted", highlight)
			}

			function toggleHandlerSector(i, highlight) {
				var sector = handlerSectors[i]
				if (sector) sector.classList.toggle("highlighted", highlight)
			}
		`}</script>
	</figure>
}

function TopSignedInitiativesGraphView({t, initiatives, path, query}) {
	var signedInitiatives = initiatives.filter((i) => i.signature_count > 0)
	signedInitiatives = _.sortBy(signedInitiatives, "signature_count").reverse()
	if (signedInitiatives.length < 2) return null
	signedInitiatives = signedInitiatives.slice(0, 10)

	var elements = signedInitiatives.map((initiative, i) => ({
		title: initiative.title,
		weight: initiative.signature_count,
		color: PIE_CHART_COLORS[i]
	}))

	return <figure id="top-signed-initiatives-graph" class="graph">
		<figcaption><h2>
			{t("initiatives_page.graphs.signed_initiatives_label")}
		</h2></figcaption>

		<div>
			<BarChartView
				bars={elements}
				barHeight={205}
				barWidth={15}
				gapWidth={2}
			/>

			<table class="legend">{signedInitiatives.map((initiative, i) => <tr>
				<td class="color" style={`color: ${PIE_CHART_COLORS[i]}`} />
				<td class="count">{initiative.signature_count}</td>

				<td class="title" title={initiative.title}>
					<a href={path + Qs.stringify(_.defaults({
						"id": initiative.id
					}, query), {addQueryPrefix: true})} class="link-button">
						{initiative.title}
					</a>
				</td>
			</tr>)}</table>
		</div>

		<script>{javascript`
			var el = document.getElementById("top-signed-initiatives-graph")
			var slice = Function.call.bind(Array.prototype.slice)
			var legend = el.querySelector(".legend")

			slice(el.querySelectorAll("svg .bar")).forEach(function(el, i) {
				el.addEventListener("mouseenter", function() {
					toggleLegendRow(i, true)
				})

				el.addEventListener("mouseleave", function() {
					toggleLegendRow(i, false)
				})
			})

			function toggleLegendRow(i, highlight) {
				legend.rows[i].classList.toggle("highlighted", highlight)
			}
		`}</script>
	</figure>
}

function PieChartView({sectors, sectorRadius, sectorWidth}) {
	var depth = _.max(sectors.map(getDepth))
	var boxWidth = 2 * (sectorRadius + depth * sectorWidth) + 5
	var boxHeight = boxWidth

	return <svg
		width={boxWidth}
		height={boxHeight}
		viewBox={"0 0 " + boxWidth + " " + boxHeight}
	>
		<defs>
			<filter id="pie-chart-sector-shadow">
				<feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.40" />
			</filter>
		</defs>

		<g transform={translate(boxWidth / 2, boxHeight / 2)}>
			{renderRing(0, 0, Math.PI * 2, sectors)}
		</g>
	</svg>

	function renderRing(ringIndex, ringStartAngle, ringEndAngle, sectors) {
		var ringAngle = ringEndAngle - ringStartAngle
		var ringRadius = sectorRadius + sectorWidth * ringIndex
		var weightAngle = ringAngle / _.sum(sectors.map(getWeight))

		return sectors.map(function(sector, sectorIndex, sectors) {
			var weightsBefore = _.sum(sectors.slice(0, sectorIndex).map(getWeight))
			var startAngle = ringStartAngle + weightAngle * weightsBefore
			var endAngle = startAngle + weightAngle * sector.weight
			let donutPaths = donut(startAngle, endAngle, ringRadius, sectorWidth)
			var labelCenterAngle = (endAngle + startAngle) / 2
			var Sector = Jsx.bind(null, sector.href ? "a" : "g")

			return <>
				<Sector class={"sector " + (sector.class || "")} href={sector.href}>
					<title>{sector.title}</title>

					<path
						fill={sector.color}
						stroke="white"
						stroke-width="1"
						d={donutPaths.join("\n")}
					/>

					<circle
						id={`ring-${ringIndex}-sector-${sectorIndex}-label-path`}
						fill="none"
						cx="0"
						cy="0"
						r={ringRadius + 10}
						transform={`rotate(${toDegrees(labelCenterAngle + Math.PI)})`}
					/>

					{sector.label ? <>
						<text>
							<textPath
								class="label"
								text-anchor="middle"
								startOffset="50%"
								href={`#ring-${ringIndex}-sector-${sectorIndex}-label-path`}
							>
								{sector.label}
							</textPath>
						</text>
					</> : null}
				</Sector>

				{sector.sectors ? <g class="subsectors">
					{renderRing(ringIndex + 1, startAngle, endAngle, sector.sectors)}
				</g> : null}
			</>
		})
	}

	function getDepth({sectors}) {
		return 1 + (sectors ? _.max(sectors.map(getDepth)) : 0)
	}
}

function BarChartView({bars, barHeight, barWidth, gapWidth}) {
	var maxWeight = _.max(bars.map(getWeight))
	let {length} = bars
	var boxWidth = length * barWidth + Math.max(length - 1, 0) * gapWidth

	return <svg
		width={boxWidth}
		height={barHeight}
		viewBox={"0 0 " + boxWidth + " " + barHeight}
	>
		<line x1="0" y1={barHeight} x2={boxWidth} y2={barHeight} stroke="#ddd" />

		{bars.map(function(el, i) {
			var x = i * barWidth + i * gapWidth
			var height = Math.max(barHeight * el.weight / maxWeight, 3)
			var y = barHeight - height

			return <g class="bar">
				<title>{el.title}</title>

				<rect
					fill="transparent"
					x={x}
					y={0}
					width={barWidth}
					height={barHeight}
				/>

				<rect
					fill={el.color}
					x={x}
					y={y}
					width={barWidth}
					height="6"
					rx="3"
					ry="3"
				/>

				<rect
					fill={el.color}
					x={x}
					y={y + 3}
					width={barWidth}
					height={barHeight - 3}
				/>
			</g>
		})}
	</svg>
}

function SignatureProgressView({t, initiative, signatureCount: count}) {
	if (initiative.external) return <div class="signature-progress external">
		{t("initiatives_page.table.signature_count.external")}
	</div>

	var threshold = getSignatureThreshold(initiative)

	if (
		count >= threshold ||
		new Date < initiative.signing_ends_at
	) return <div
		class={"signature-progress " + (count >= threshold ? "completed" : "")}
		style={Css.linearBackground("#00cb81", Math.min(count / threshold, 1))}
	>{initiative.has_paper_signatures
		? t("initiatives_page.table.signature_count.progress_with_paper", {
			signatureCount: count
		})
		: t("initiatives_page.table.signature_count.progress", {
			signatureCount: count
		})
	}</div>

	else return <div class="signature-progress failed">
		{t("initiatives_page.table.signature_count.progress", {
			signatureCount: count
		})}
	</div>
}

function groupInitiatives(by, initiatives) {
	// Can't just depend on _.groupBy and JavaScript key-insertion order as if
	// you group by strings that resemble numbers, the insertion-order
	// preservation no longer applies.
	return _.groupAdjacent(initiatives, (a, b) => (
		groupInitiative(by, a) === groupInitiative(by, b)
	))
}

function groupInitiative(by, initiative) {
	switch (by) {
		case "title": return initiative.title[0].toUpperCase() || ""
		case "destination": return initiative.destination
		case "phase": return initiative.phase
		case "published-at": return initiative.published_at.getFullYear()

		case "signing-started-at": return (
			initiative.signing_started_at &&
			initiative.signing_started_at.getFullYear()
		)

		case "signing-ended-at": return (
			initiative.signing_ends_at &&
			initiative.signing_ends_at.getFullYear()
		)

		case "signature-count": return (
			initiative.external ? "1000+" :
			initiative.signature_count == 0 ? "0" :
			Math.pow(10, Math.floor(Math.log10(initiative.signature_count))) + "+"
		)

		case "last-signed-at": return (
			initiative.last_signed_at &&
			initiative.last_signed_at.getFullYear()
		)

		case "proceedings-started-at":
			var proceedingsStartedAt = getProceedingsStartedAt(initiative)
			return proceedingsStartedAt && proceedingsStartedAt.getFullYear()

		case "proceedings-ended-at":
			var proceedingsEndedAt = getProceedingsEndedAt(initiative)
			return proceedingsEndedAt && proceedingsEndedAt.getFullYear()

		case "proceedings-handler":
			return getProceedingsHandlers(initiative)[0] || null

		default: return null
	}
}

function getProceedingsStartedAt(initiative) {
	return (
		initiative.accepted_by_parliament_at ||
		initiative.accepted_by_government_at
	)
}

function getProceedingsEndedAt(initiative) {
	return (
		initiative.finished_in_parliament_at ||
		initiative.finished_in_government_at
	)
}

function getProceedingsHandlers(initiative) {
	if (initiative.destination == "parliament") {
		if (initiative.accepted_by_parliament_at)
			return initiative.parliament_committees
	}
	else if (initiative.destination) {
		if (initiative.accepted_by_government_at) return [initiative.destination]
	}

	return []
}

function nameProceedingsHandler(lang, handler) {
	return handler in PARLIAMENT_COMMITTEES
		? I18n.nameParliamentCommittee(lang, handler)
		: handler in LOCAL_GOVERNMENTS
		? LOCAL_GOVERNMENTS[handler].name
		: handler
}

function serializeFilters(filters) {
	var serializeDateRange = _.compose(
		serializeRangeEndpoints.bind(null, formatIsoDate),
		inclusifyDateRange
	)

	filters = _.clone(filters)

	if (filters.publishedOn) filters.publishedOn =
		serializeDateRange(filters.publishedOn)
	if (filters.signingStartedOn) filters.signingStartedOn =
		serializeDateRange(filters.signingStartedOn)
	if (filters.signingEndsOn) filters.signingEndsOn =
		serializeDateRange(filters.signingEndsOn)
	if (filters.lastSignedOn) filters.lastSignedOn =
		serializeDateRange(filters.lastSignedOn)
	if (filters.proceedingsStartedOn) filters.proceedingsStartedOn =
		serializeDateRange(filters.proceedingsStartedOn)
	if (filters.proceedingsEndedOn) filters.proceedingsEndedOn =
		serializeDateRange(filters.proceedingsEndedOn)

	return Filtering.serializeFilters(_.mapKeys(filters, _.kebabCase))
}

function inclusifyDateRange({begin, end, bounds}) {
	if (bounds[0] == "(" && begin) begin = DateFns.addDays(begin, 1)
	if (bounds[1] == ")" && end) end = DateFns.addDays(end, -1)
	return new Range(begin, end, "[]")
}

function serializeRangeEndpoints(serialize, {begin, end, bounds}) {
	return new Range(begin && serialize(begin), end && serialize(end), bounds)
}

function donut(startAngle, endAngle, circleRadius, arcWidth) {
	var centralAngle = Math.abs(endAngle - startAngle)
	if (centralAngle >= Math.PI * 2) endAngle = startAngle - 0.001

	var innerStartX = Math.cos(startAngle) * circleRadius
	var innerStartY = Math.sin(startAngle) * circleRadius
	var innerEndX = Math.cos(endAngle) * circleRadius
	var innerEndY = Math.sin(endAngle) * circleRadius

	var outerCircleRadius = circleRadius + arcWidth
	var outerStartX = Math.cos(startAngle) * outerCircleRadius
	var outerStartY = Math.sin(startAngle) * outerCircleRadius
	var outerEndX = Math.cos(endAngle) * outerCircleRadius
	var outerEndY = Math.sin(endAngle) * outerCircleRadius

	let largerThanHalf = Number(centralAngle >= Math.PI)

	return [
		`M ${innerStartX} ${innerStartY}`,
		`A ${circleRadius} ${circleRadius} 0 ${largerThanHalf} 1 ${innerEndX} ${innerEndY}`,
		`L ${outerEndX} ${outerEndY}`,
		`A ${outerCircleRadius} ${outerCircleRadius} 0 ${largerThanHalf} 0 ${outerStartX} ${outerStartY}`,
		`Z`,
	]
}

function renderParliamentDecision(t, decision) {
	switch (decision) {
		case "return":
		case "reject":
		case "forward":
		case "forward-to-government":
		case "solve-differently":
		case "draft-act-or-national-matter":
			var key = decision.replace(/-/g, "_")
			return Jsx.html(t("initiatives_page.table.parliament_decisions." + key))

		default: return null
	}
}

function anyDefined(obj) { return _.any(obj, (value) => value != null) }
function translate(x, y) { return "translate(" + x + ", " + y + ")" }
function toDegrees(radians) { return radians * (360 / (Math.PI * 2)) }

/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Qs = require("qs")
var Jsx = require("j6pack")
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
var formatIsoDate = require("root/lib/i18n").formatDate.bind(null, "iso")
var {renderAuthorName} = require("./initiative_page")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
var LOCAL_GOVERNMENTS_BY_COUNTY = LOCAL_GOVERNMENTS.BY_COUNTY
var {PHASES} = require("root/lib/initiative")
module.exports = InitiativesPage

function InitiativesPage({
	t,
	req,
	flash,
	filters,
	order,
	initiatives,
	parliamentCommittees
}) {
	var [orderBy, orderDir] = order
	var filterQuery = serializeFilters(filters)
	var initiativesPath = req.baseUrl + req.path

	return <Page
		page="initiatives"
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
			<h1>Algatused</h1>

			<table id="initiatives">
				<caption>
					{initiatives.length > 0 ? <div class="total">{_.any(filters) ? <>
						Leitud <strong>{initiatives.length}</strong> algatust.
					</> : <>
						Kokku <strong>{initiatives.length}</strong> algatust.
					</>}</div> : null}

					<FiltersView
						t={t}
						filters={filters}
						path={initiativesPath}
						order={order}
						parliamentCommittees={parliamentCommittees}
					/>
				</caption>

				<thead>
					<tr title="Sorteeri">
						<th>
							<SortButton
								path={initiativesPath}
								query={filterQuery}
								name="title"
								sorted={orderBy == "title" ? orderDir : null}
							>
								Pealkiri
							</SortButton>

							<small>
								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="destination"
									sorted={orderBy == "destination" ? orderDir : null}
								>
									Saaja
								</SortButton>

								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="author"
									sorted={orderBy == "author" ? orderDir : null}
								>
									Algataja
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
							<span class="column-name">Ühisloomes</span>

							<small>
								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="published-at"
									direction="desc"
									sorted={orderBy == "published-at" ? orderDir : null}
								>
									Algus
								</SortButton>
							</small>
						</th>

						<th colspan="2" class="sign-phase-column">
							<span class="column-name">Allkirjastamisel</span>

							<small>
								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="signing-started-at"
									direction="desc"
									sorted={orderBy == "signing-started-at" ? orderDir : null}
								>
									Algus
								</SortButton>

								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="signing-ended-at"
									direction="desc"
									sorted={orderBy == "signing-ended-at" ? orderDir : null}
								>
									Lõpp
								</SortButton>

								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="signature-count"
									direction="desc"
									sorted={orderBy == "signature-count" ? orderDir : null}
								>
									Allkirju
								</SortButton>
							</small>
						</th>

						<th class="proceedings-phase-column">
							<span class="column-name">Menetluses</span>

							<small>
								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="proceedings-started-at"
									direction="desc"
									sorted={orderBy == "proceedings-started-at" ? orderDir : null}
								>
									Algus
								</SortButton>

								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="proceedings-ended-at"
									direction="desc"
									sorted={orderBy == "proceedings-ended-at" ? orderDir : null}
								>
									Lõpp
								</SortButton>

								<SortButton
									path={initiativesPath}
									query={filterQuery}
									name="proceedings-handler"
									direction="asc"
									sorted={orderBy == "proceedings-handler" ? orderDir : null}
								>
									Menetleja
								</SortButton>
							</small>
						</th>
					</tr>
				</thead>

				{initiatives.length == 0 ? <tbody class="empty"><tr>
					<td colspan="8">{_.any(filters) ? <>
						<p>Kahjuks ei leidnud ühtki filtritele vastavat algatust.</p>

						<p>
							<a href={initiativesPath + Qs.stringify({
								order: orderBy
									? (orderDir == "asc" ? "" : "-") + orderBy
									: undefined
							}, {addQueryPrefix: true})}
							class="link-button">Vaata kõiki algatusi</a></p>.
						</>
						: <p>Veel ei ole ühtki algatust.</p>
					}</td>
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

						orderBy == "proceedings-started-at" ? (
							group ||
							t("initiatives_page.table.proceedings_started_at_ungrouped")
						) :

						orderBy == "proceedings-ended-at" ? (
							group ||
							t("initiatives_page.table.proceedings_ended_at_ungrouped")
						) :

						group

					return <InitiativeGroupView
						t={t}
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
	filters,
	path,
	order: [orderBy, orderDir],
	parliamentCommittees
}) {
	return <div id="filters">
		<details>
			<summary>
				<span class="open-text">
					{_.any(filters) ? "Muuda filtreid" : "Filtreeri algatusi"}
				</span>
			</summary>

			<form method="get" action={path}>
				<label>
					<span>{t("initiatives_page.filters.phase_label")}</span>

					<select name="phase" class="form-select">
						<option value="" selected={filters.phase == null}>
							{t("initiatives_page.filters.phases.all")}
						</option>

						{PHASES.map((phase) => <option
							value={phase}
							selected={filters.phase == phase}
						>
							{t("initiatives_page.phases." + phase)}
						</option>)}
					</select>
				</label>

				<label>
					<span>Saaja</span>

					<select name="destination" class="form-select">
						<option value="" selected={filters.destination == null}>
							Kõik
						</option>

						<optgroup label="Riiklik">
							<option
								value="parliament"
								selected={(filters.destination || []).includes("parliament")}
							>
								Riigikogu
							</option>
						</optgroup>

						{_.map(LOCAL_GOVERNMENTS_BY_COUNTY, (govs, county) => <optgroup
							label={county + " maakond"}
						>{govs.map(([id, {name}]) => <option
							value={id}
							selected={(filters.destination || []).includes(id)}
						>{name}</option>)}</optgroup>)}
					</select>
				</label>

				<label>
					<span>Avalikustatud alates</span>

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
					<span>Avalikustatud kuni (k.a)</span>

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
					<span>Allkirjastamise algus alates</span>

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
					<span>Allkirjastamise algus kuni (k.a)</span>

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
					<span>Menetluse algus alates</span>

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
					<span>Menetluse algus kuni (k.a)</span>

					<input
						type="date"
						name="proceedings-started-on<"
						class="form-input"

						value={
							filters.proceedingsStartedOn &&
							filters.proceedingsStartedOn.end &&

							formatIsoDate(
								DateFns.addDays(filters.proceedingsStartedOn.end, -1)
							)
						}
					/>
				</label>

				<label>
					<span>Menetluse lõpp alates</span>

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
					<span>Menetluse lõpp kuni (k.a)</span>

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
					<span>Menetleja</span>

					<select name="proceedings-handler" class="form-select">
						<option value="" selected={filters.proceedingsHandler == null}>
							Kõik
						</option>

						<optgroup label="Riigikogu">
							{parliamentCommittees.map((committee) => <option
								value={committee}
								selected={filters.proceedingsHandler == committee}
							>
								{committee}
							</option>)}
						</optgroup>

						{_.map(LOCAL_GOVERNMENTS_BY_COUNTY, (govs, county) => <optgroup
							label={county + " maakond"}
						>{govs.map(([id, {name}]) => <option
							value={id}
							selected={filters.proceedingsHandler == id}
						>{name}</option>)}</optgroup>)}
					</select>
				</label>

				<br />
				<button type="submit" class="blue-rounded-button">
					{t("initiatives_page.filters.filter_button")}
				</button>

				{_.any(filters, _.id) ? <>
					või <a href={path + Qs.stringify({
						order: orderBy
							? (orderDir == "asc" ? "" : "-") + orderBy
							: undefined
					}, {addQueryPrefix: true})} class="link-button">eemalda filtrid</a>.
				</> : null}

				{orderBy ? <input
					type="hidden"
					name="order"
					value={(orderDir == "asc" ? "" : "-") + orderBy}
				/> : null}
			</form>
		</details>

		<CurrentFiltersView t={t} filters={filters} />
	</div>
}

function CurrentFiltersView({t, filters}) {
	var facets = _.intersperse([
		filters.phase && <Filter name="Faas">
			<strong>{t("initiatives_page.phases." + filters.phase)}</strong>
		</Filter>,

		filters.destination && <Filter name="Saaja">
			<ul>{filters.destination.map((destination) => <li>
				<strong>{destination == "parliament"
					? "Riigikogu"
					: LOCAL_GOVERNMENTS[destination].name
				}</strong>
			</li>)}</ul>
		</Filter>,

		filters.publishedOn && <Filter name="Avalikustatud">
			<DateRangeView range={filters.publishedOn} />
		</Filter>,

		filters.signingStartedOn && <Filter name="Allkirjastamise algus">
			<DateRangeView range={filters.signingStartedOn} />
		</Filter>,

		filters.proceedingsStartedOn && <Filter name="Menetluse algus">
			<DateRangeView range={filters.proceedingsStartedOn} />
		</Filter>,

		filters.proceedingsEndedOn && <Filter name="Menetluse lõpp">
			<DateRangeView range={filters.proceedingsEndedOn} />
		</Filter>,

		filters.proceedingsHandler && <Filter name="Menetleja">
			<strong>{filters.proceedingsHandler in LOCAL_GOVERNMENTS
				? LOCAL_GOVERNMENTS[filters.proceedingsHandler].name
				: filters.proceedingsHandler
			}</strong>
		</Filter>
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


function InitiativeGroupView({title, initiatives, t}) {
	return <tbody>
		<tr class="table-group-header">
			<th colspan="8" scope="rowgroup">
				{title ? <h2>{title}</h2> : null}
			</th>
		</tr>

		{initiatives.map(function(initiative) {
			var authorName = renderAuthorName(initiative)
			var proceedingsStartedAt = getProceedingsStartedAt(initiative)
			var proceedingsEndedAt = getProceedingsEndedAt(initiative)
			var proceedingsHandler = getProceedingsHandler(initiative)

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

					<span class="author" title={authorName}>{authorName}</span>
				</td>

				<td class="phase-column" title="Faas">
					<span class={"phase " + initiative.phase + "-phase"}>
						{t("initiatives_page.phases." + initiative.phase)}
					</span>
				</td>

				<td class="published-at-column edit-phase-column" title="Ühisloomes">
					<DateView date={initiative.published_at} />
				</td>

				<td class="signing-started-at-column signing-ended-at-column sign-phase-column" title="Allkirjastamisel">
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

				<td class="signature-count-column sign-phase-column" title="Allkirjad">{
					initiative.phase != "edit" ? <SignatureProgressView
						t={t}
						initiative={initiative}
						signatureCount={initiative.signature_count}
					/> : null
				}</td>

				<td class="proceedings-started-at-column proceedings-ended-at-column proceedings-phase-column" title="Menetluses">
					{proceedingsStartedAt
						? <DateView date={proceedingsStartedAt} />
						: null
					}

					{proceedingsStartedAt && proceedingsEndedAt ? "—" : ""}
					{proceedingsEndedAt ? <DateView date={proceedingsEndedAt} /> : null}

					{proceedingsHandler ? <>
						<br />

						<span class="proceedings-handler" title="Menetleja">
							{proceedingsHandler}
						</span>
					</> : null}
				</td>
			</tr>
		})}
	</tbody>
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

		case "proceedings-started-at":
			var proceedingsStartedAt = getProceedingsStartedAt(initiative)
			return proceedingsStartedAt && proceedingsStartedAt.getFullYear()

		case "proceedings-ended-at":
			var proceedingsEndedAt = getProceedingsEndedAt(initiative)
			return proceedingsEndedAt && proceedingsEndedAt.getFullYear()

		case "proceedings-handler": return getProceedingsHandler(initiative)
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

function getProceedingsHandler(initiative) {
	return initiative.parliament_committee || (
		initiative.destination != "parliament" &&
		initiative.accepted_by_government_at
		? LOCAL_GOVERNMENTS[initiative.destination].name
		: null
	)
}

function serializeFilters(filters) {
	var serializeDateRange = _.compose(
		serializeRangeEndpoints.bind(null, formatIsoDate),
		inclusifyDateRange
	)

	filters = _.clone(filters)

	if (filters.publishedOn)
		filters.publishedOn = serializeDateRange(filters.publishedOn)
	if (filters.signingStartedOn)
		filters.signingStartedOn = serializeDateRange(filters.signingStartedOn)
	if (filters.signingEndsOn)
		filters.signingEndsOn = serializeDateRange(filters.signingEndsOn)

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

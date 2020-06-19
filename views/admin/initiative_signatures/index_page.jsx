/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var Form = Page.Form
var formatDate = require("root/lib/i18n").formatDate
var SignaturesController =
	require("root/controllers/admin/initiative_signatures_controller")
var {getSexFromPersonalId} = SignaturesController
var {getBirthdateFromPersonalId} = SignaturesController
var {getAgeRange} = SignaturesController
var {serializeLocation} = SignaturesController
var {COLUMNS} = SignaturesController

var COLUMN_TITLES = {
	created_on: "Date",
	initiative_uuid: "Initiative",
	past_signatures: "Past Signatures (25mo)",
	sex: "Sex",
	age_range: "Age Range",
	location: "From"
}

module.exports = function(attrs) {
	var req = attrs.req
	var from = attrs.from
	var to = attrs.to
	var columns = attrs.columns
	var timeFormat = attrs.timeFormat
	var locationFormat = attrs.locationFormat
	var signatures = attrs.signatures

	return <Page page="signatures" title="Signature" req={attrs.req}>
		<h1 class="admin-heading">Signatures</h1>

		<Form
			method="get"
			class="admin-inline-form options-form"
			req={req}
		>
			<fieldset class="date-range-fields">
				<label class="admin-label">From</label>
				<input
					type="date"
					class="admin-input"
					name="from"
					value={from && formatDate("iso", from)}
				/>

				<label class="admin-label">To 00:00 of</label>
				<input
					type="date"
					class="admin-input"
					name="to"
					value={to && formatDate("iso", to)}
				/>
			</fieldset>

			<fieldset class="column-fields">
				<h2>Columns:</h2>

				<ol>{COLUMNS.map(function(column) {
					return <li>
						<label class="column-checkbox">
							<input
								type="checkbox"
								name="columns[]"
								value={column}
								checked={columns.includes(column)}
							/>

							{COLUMN_TITLES[column]}
						</label>

						{column == "created_on" ? <div>
							Signing time as

							<label>
								<input
									type="radio"
									name="time-format"
									value="date"
									checked={timeFormat == "date"}
								/>

								Date
							</label>
							{" or "}
							<label>
								<input
									type="radio"
									name="time-format"
									value="week"
									checked={timeFormat == "week"}
								/>

								Week
							</label>
						</div> : null}

						{column == "location" ? <div>
							Location as

							<label>
								<input
									type="radio"
									name="location-format"
									value="text"
									checked={locationFormat == "text"}
								/>

								Text
							</label>
							{" or "}
							<label>
								<input
									type="radio"
									name="location-format"
									value="geoname"
									checked={locationFormat == "geoname"}
								/>

								GeoNames Id
							</label>
						</div> : null}
					</li>
				})}</ol>
			</fieldset>

			<button class="admin-submit">Filter</button>

			<button
				formaction={req.baseUrl + ".csv"}
				class="admin-submit"
			>
				Download CSV
			</button>
		</Form>

		<table class="admin-table">
			<thead>
				<tr>{columns.map((column) => { switch (column) {
					case "created_on": return <th>
						{timeFormat == "date" ? "Date" : "Week (ISO)"}
					</th>

					case "location": return <th>
						{locationFormat == "text" ? "Location" : "GeoName Id"}
					</th>

					default: return <th>{COLUMN_TITLES[column]}</th>
				}})}</tr>
			</thead>

			<tbody>
				{_.sortBy(signatures, "created_at").reverse().map(function(sig) {
					var initiativeUuid = sig.initiative_uuid
					var initiativePath = `${req.rootUrl}/initiatives/${initiativeUuid}`
					var birthdate = getBirthdateFromPersonalId(sig.personal_id)

					return <tr>{columns.map((column) => { switch (column) {
						case "created_on": return <td>{timeFormat == "date"
							? formatDate("iso", sig.created_at)
							: formatDate("iso-week", sig.created_at)
						}</td>

						case "initiative_uuid": return <td>
							<a href={initiativePath} class="admin-link">
								{sig.initiative_title}
							</a>
						</td>

						case "past_signatures": return <td>{sig.past_signatures}</td>
						case "sex": return <td>{getSexFromPersonalId(sig.personal_id)}</td>

						case "age_range": return <td>
							{getAgeRange(birthdate, sig.created_at)}
						</td>

						case "location": return <td>
							{sig.created_from ? (locationFormat == "text"
								? serializeLocation(sig.created_from)
								: sig.created_from.city_geoname_id
							) : null}
						</td>

						default: throw new RangeError("Unknown column: " + column)
					}})}
				</tr>})}
			</tbody>
		</table>
	</Page>
}

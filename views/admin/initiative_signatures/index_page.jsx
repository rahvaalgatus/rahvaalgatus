/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var {Form} = Page
var SignaturesController =
	require("root/controllers/admin/initiative_signatures_controller")
var {formatDate} = require("root/lib/i18n")
var {getBirthyearFromPersonalId} = SignaturesController
var {getSexFromPersonalId} = SignaturesController
var {getAgeRange} = SignaturesController
var {serializeLocation} = SignaturesController
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
var {COLUMNS} = SignaturesController

var COLUMN_TITLES = {
	created_on: "Date",
	initiative_id: "Initiative Id",
	initiative_uuid: "Initiative UUID",
	initiative_title: "Initiative Title",
	initiative_destination: "Initiative Destination",
	sex: "Sex",
	age_range: "Age Range",
	method: "Method",
	location: "From"
}

module.exports = function(attrs) {
	var {req} = attrs
	var {from} = attrs
	var {to} = attrs
	var {columns} = attrs
	var {timeFormat} = attrs
	var {locationFormat} = attrs
	var {signatures} = attrs

	var tooMany = signatures.length > 1000
	signatures = signatures.slice(0, 1000)

	var columnsWithoutId = _.uniq(columns.map((col) => (
		col == "initiative_id" ? "initiative_title" :
		col == "initiative_uuid" ? "initiative_title" :
		col
	)))

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

				<label class="admin-label">To Start of</label>
				<input
					type="date"
					class="admin-input"
					name="to"
					value={to && formatDate("iso", to)}
				/>
			</fieldset>

			<fieldset class="column-fields">
				<h2>Columns</h2>

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
							{" "}
							<label>
								<input
									type="radio"
									name="time-format"
									value="date"
									checked={timeFormat == "date"}
								/>
								{" "}
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
								{" "}
								Week
							</label>
						</div> : null}

						{column == "location" ? <div>
							Location as
							{" "}
							<label>
								<input
									type="radio"
									name="location-format"
									value="text"
									checked={locationFormat == "text"}
								/>
								{" "}
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
								{" "}
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

		<table id="signatures-table" class="admin-table">
			{tooMany ? <caption>
				More than a 1000 results. Displaying the first 1000.
			</caption> : null}

			<thead>
				<tr>{columnsWithoutId.map((column) => { switch (column) {
					case "created_on": return <th>
						{timeFormat == "date" ? "Date" : "Week (ISO)"}
					</th>

					case "initiative_title": return <th>Initiative</th>

					case "location": return <th>
						{locationFormat == "text" ? "Location" : "GeoName Id"}
					</th>

					default: return <th>{COLUMN_TITLES[column]}</th>
				}})}</tr>
			</thead>

			<tbody>
				{_.sortBy(signatures, "created_at").reverse().map(function(sig) {
					var initiativeId = sig.initiative_id
					var initiativePath = `${req.rootUrl}/initiatives/${initiativeId}`

					return <tr>{columnsWithoutId.map((column) => { switch (column) {
						case "created_on": return <td>{timeFormat == "date"
							? formatDate("iso", sig.created_at)
							: formatDate("iso-week", sig.created_at)
						}</td>

						case "initiative_title": return <td>
							<a href={initiativePath} class="admin-link">
								{sig.initiative_title}
							</a>
						</td>

						case "initiative_destination": return <td>
							{sig.initiative_destination == "parliament"
								? "Riigikogu"
								: LOCAL_GOVERNMENTS[sig.initiative_destination].name
							}
						</td>

						case "sex": return <td>{getSexFromPersonalId(sig.personal_id)}</td>

						case "age_range": return <td>{getAgeRange(
							new Date(getBirthyearFromPersonalId(sig.personal_id), 0, 1),
							sig.created_at
						)}</td>

						case "method": return <td class="method-column">{sig.method}</td>

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

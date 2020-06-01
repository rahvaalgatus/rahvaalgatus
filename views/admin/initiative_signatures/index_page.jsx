/** @jsx Jsx */
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

module.exports = function(attrs) {
	var req = attrs.req
	var from = attrs.from
	var to = attrs.to
	var signatures = attrs.signatures
	var withLocation = attrs.withLocation
	var timeFormat = attrs.timeFormat

	return <Page page="signatures" title="Signature" req={attrs.req}>
		<h1 class="admin-heading">Signatures</h1>

		<Form
			method="get"
			class="admin-inline-form options-form"
			req={req}
		>
			<fieldset>
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

			<fieldset>
				<label>
					<input type="hidden" name="with-location" value="false" />

					<input
						type="checkbox"
						name="with-location"
						value="true"
						checked={withLocation}
					/>

					Include location
				</label>
				<br />

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

				<label>
					<input
						type="radio"
						name="time-format"
						value="week"
						checked={timeFormat == "week"}
					/>

					Week
				</label>
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
				<tr>
					<th>{timeFormat == "date" ? "Date" : "Week (ISO)"}</th>
					<th>Initiative</th>
					<th>Signer Id</th>
					<th>Signer Ordinal</th>
					<th>Sex</th>
					<th>Age Range</th>
					{withLocation ? <th>From</th> : null}
				</tr>
			</thead>

			<tbody>
				{signatures.map(function(sig) {
					var initiativeUuid = sig.initiative_uuid
					var initiativePath = `${req.rootUrl}/initiatives/${initiativeUuid}`
					var birthdate = getBirthdateFromPersonalId(sig.personal_id)

					return <tr>
						<td>{timeFormat == "date"
							? formatDate("iso", sig.created_at)
							: formatDate("iso-week", sig.created_at)
						}</td>

						<td>
							<a href={initiativePath} class="admin-link">
								{sig.initiative_title}
							</a>
						</td>

						<td>
							{sig.signer_id}
						</td>

						<td>
							{sig.signer_ordinal}
						</td>

						<td>{getSexFromPersonalId(sig.personal_id)}</td>
						<td>
							{getAgeRange(birthdate, sig.created_at)}
						</td>

						{withLocation ? <td>
							{sig.created_from && serializeLocation(sig.created_from)}
						</td> : null}
					</tr>
				})}
			</tbody>
		</table>
	</Page>
}

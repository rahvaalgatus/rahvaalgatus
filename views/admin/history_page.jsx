/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("./page")
var DateFns = require("date-fns")
var {YearMonth} = require("root/lib/time")

module.exports = function(attrs) {
	var {req} = attrs
	var {authenticationCounts} = attrs
	var {signatureCounts} = attrs
	var authenticationCountsByYm = _.indexBy(authenticationCounts, "year_month")
	var signatureCountsByYm = _.indexBy(signatureCounts, "year_month")

	var last = YearMonth.now()

	var first = _.min([
		authenticationCounts[0] && authenticationCounts[0].year_month || last,
		signatureCounts[0] && signatureCounts[0].year_month || last
	])

	var months = []

	for (var ym = first; ym <= last; ym = ym.addMonths(1)) months.push({
		year_month: ym,
		authentications: authenticationCountsByYm[ym] || {},
		signatures: signatureCountsByYm[ym] || {}
	})

	var yearsAndMonths = _.toEntries(
		_.groupBy(months, (obj) => obj.year_month.year)
	).reverse().map(([year, months]) => [year, months.reverse()])

	return <Page page="history" title="History" req={req}>
		<h1 class="admin-heading">History</h1>

		<p class="admin-paragraph intro">
			You can select individual colums and rows in the browser by holding <kbd>Control</kbd> when dragging.<br />

			The "remaining signatures" column indicates the number of signatures still held in the database. The number of deleted signatures is not included in any column.
		</p>

		<table id="history-table" class="admin-table">
			<thead class="admin-sticky-header">
				<tr>
					<th class="month-column">Month</th>
					<th colspan="4">Authentications</th>
					<th colspan="16">Signatures</th>
				</tr>

				<tr>
					<th />

					<th>Total</th>
					<th>ID-card</th>
					<th>Mobile-ID</th>
					<th>Smart-ID</th>

					<th colspan="4">Total (ID-card + Mobile-ID + Smart-ID)</th>
					<th colspan="4">ID-card</th>
					<th colspan="4">Mobile-ID</th>
					<th colspan="4">Smart-ID</th>
				</tr>

				<tr>
					<th colspan="5" />

					<th>Total</th>
					<th>Remaining</th>
					<th>Oversigned</th>
					<th title="Oversigned Percentage">…%</th>

					<th>Total</th>
					<th>Remaining</th>
					<th>Oversigned</th>
					<th title="Oversigned Percentage">…%</th>

					<th>Total</th>
					<th>Remaining</th>
					<th>Oversigned</th>
					<th title="Oversigned Percentage">…%</th>

					<th>Total</th>
					<th>Remaining</th>
					<th>Oversigned</th>
					<th title="Oversigned Percentage">…%</th>
				</tr>
			</thead>

			{yearsAndMonths.map(function([year, months]) {
				return <tbody>
					<tr class="admin-table-columns-header">
						<th colspan="21">{year}</th>
					</tr>

					{months.map(function(counts) {
						var ym = counts.year_month

						return <tr>
							<td class="month-column">
								{DateFns.format(ym.toDate(), "YYYY MMM")}
							</td>

							<td class="authentication-column">
								{counts.authentications.all || 0}
							</td>

							<td class="authentication-column">
								{counts.authentications.id_card || 0}
							</td>

							<td class="authentication-column">
								{counts.authentications.mobile_id || 0}
							</td>

							<td class="authentication-column">
								{counts.authentications.smart_id || 0}
							</td>

							<td class="signature-column signature-column-1st">{_.sum([
								counts.signatures.all || 0,
								counts.signatures.all_oversigned || 0
							])}</td>

							<td class="signature-column">{counts.signatures.all || 0}</td>

							<td class="signature-column">
								{counts.signatures.all_oversigned || 0}
							</td>

							<td class="signature-column">{percent(
								(counts.signatures.all_oversigned || 0) / _.sum([
								counts.signatures.all || 0,
								counts.signatures.all_oversigned || 0
							]))}</td>

							<td class="signature-column id-card-signature-column-1st">{_.sum([
								counts.signatures.id_card || 0,
								counts.signatures.id_card_oversigned || 0
							])}</td>

							<td class="signature-column">
								{counts.signatures.id_card || 0}
							</td>

							<td class="signature-column">
								{counts.signatures.id_card_oversigned || 0}
							</td>

							<td class="signature-column">{percent(
								(counts.signatures.id_card_oversigned || 0) / _.sum([
								counts.signatures.id_card || 0,
								counts.signatures.id_card_oversigned || 0
							]))}</td>

							<td class="signature-column mobile-id-signature-column-1st">
								{_.sum([
									counts.signatures.mobile_id || 0,
									counts.signatures.mobile_id_oversigned || 0
								])}
							</td>

							<td class="signature-column">
								{counts.signatures.mobile_id || 0}
							</td>

							<td class="signature-column">
								{counts.signatures.mobile_id_oversigned || 0}
							</td>

							<td class="signature-column">{percent(
								(counts.signatures.mobile_id_oversigned || 0) / _.sum([
								counts.signatures.mobile_id || 0,
								counts.signatures.mobile_id_oversigned || 0
							]))}</td>

							<td class="signature-column smart-id-signature-column-1st">
								{_.sum([
									counts.signatures.smart_id || 0,
									counts.signatures.smart_id_oversigned || 0
								])}
							</td>

							<td class="signature-column">
								{counts.signatures.smart_id || 0}
							</td>

							<td class="signature-column">
								{counts.signatures.smart_id_oversigned || 0}
							</td>

							<td class="signature-column">{percent(
								(counts.signatures.smart_id_oversigned || 0) / _.sum([
								counts.signatures.smart_id || 0,
								counts.signatures.smart_id_oversigned || 0
							]))}</td>
						</tr>
					})}
				</tbody>
			})}
		</table>
	</Page>
}

function percent(n) {
	if (isNaN(n)) return ""
	return (n * 100).toFixed(2) + "%"
}

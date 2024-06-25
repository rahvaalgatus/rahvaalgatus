/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var Config = require("root").config
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
var LOCAL_GOVERNMENTS_BY_COUNTY = LOCAL_GOVERNMENTS.BY_COUNTY

module.exports = function({req, signatureTrustees}) {
	var signatureTrusteesByDestination = _.groupBy(
		signatureTrustees,
		"initiative_destination"
	)

	return <Page page="destinations" title="Destinations" req={req}>
		<h1 class="admin-heading">Destinations</h1>

		<table class="admin-table">
			<thead>
				<tr>
					<th>Destination</th>
					<th class="population-column">Population</th>
					<th class="voter-count-column">Voter Count</th>
					<th class="signature-threshold-column">Signature Threshold</th>
					<th>Signature Email</th>
					<th>Signature Trustees</th>
				</tr>
			</thead>

			<tbody>
				<tr>
					<td>Riigikogu</td>

					<td class="population-column">
						{_.sum(_.map(LOCAL_GOVERNMENTS, "population"))}
					</td>

					<td class="voter-count-column">
						{_.sum(_.map(LOCAL_GOVERNMENTS, "voterCount"))}
					</td>

					<td class="signature-threshold-column">
						{Config.votesRequired}
					</td>

					<td><a href={"mailto:" + Config.parliamentEmail} class="admin-link">
						{Config.parliamentEmail}
					</a></td>

					<td />
				</tr>
			</tbody>

			{_.map(LOCAL_GOVERNMENTS_BY_COUNTY, function(govs, county) {
				return <tbody>
					<tr class="admin-table-columns-header">
						<th colspan="6">{county} maakond</th>
					</tr>

					{govs.map(function([id, gov]) {
						var signatureTrustees = signatureTrusteesByDestination[id] || []

						return <tr>
							<td>
								<a href={req.baseUrl + "/" + id} class="admin-link">
									{gov.name}
								</a>
							</td>

							<td class="population-column">{gov.population}</td>
							<td class="voter-count-column">{gov.voterCount}</td>

							<td class="signature-threshold-column">
								{gov.signatureThreshold}
							</td>

							<td>
								<ul>{gov.initiativesEmails.map((email) => <li>
									<a href={"mailto:" + email} class="admin-link">{email}</a>
								</li>)}</ul>
							</td>

							<td>
								<ul>{signatureTrustees.map((trustee) => <li>
									{trustee.name} ({trustee.personal_id})
								</li>)}</ul>
							</td>
						</tr>
					})}
				</tbody>
			})}
		</table>
	</Page>
}

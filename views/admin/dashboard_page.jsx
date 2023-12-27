/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("./page")
var {Form} = Page
var Config = require("root").config
var {formatDate} = require("root/lib/i18n")
var {formatDateTime} = require("root/lib/i18n")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")

module.exports = function(attrs) {
	var {from} = attrs
	var {to} = attrs
	var {lastSubscriptions} = attrs

	return <Page page="dashboard" title="Dashboard" req={attrs.req}>
		<h1 class="admin-heading">Dashboard</h1>

		<h2 class="admin-subheading">Overview</h2>

		<Form method="get" class="admin-inline-form overview-form">
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

			<button class="admin-submit">Limit</button>
		</Form>

		<table class="admin-horizontal-table"><tbody>
			<tr>
				<th scope="row">
					Initiatives created<br />
					<small>Created on Rahvaalgatus and not deleted. May be private.</small>
				</th>
				<td>{attrs.initiativesCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives published<br />
					<small>Created on Rahvaalgatus, published and not deleted.</small>
				</th>

				<td>
					<strong>{attrs.publishedInitiativesCount.all}</strong>

					<ul>
						<li>{attrs.publishedInitiativesCount.parliament} for Riigikogu.</li>

						<li>
							{attrs.publishedInitiativesCount.local} for Local Governments.
						</li>
					</ul>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives created on Riigikogu<br />

					<small>
						Imported from the parliament. Dated by Riigikogu. Excludes ours.
					</small>
				</th>

				<td>{attrs.externalInitiativesCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives sent to signing<br />

					<small>
						Sent to signing during given period, regardless of creation date.
					</small>
				</th>

				<td>
					<strong>{attrs.signingStartedCount.all}</strong>

					<ul>
						<li>{attrs.signingStartedCount.parliament} for Riigikogu.</li>

						<li>
							{attrs.signingStartedCount.local} for Local Governments.
						</li>
					</ul>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives for Riigikogu that passed {Config.votesRequired} signatures<br />
					<small>Milestone reached, regardless of creation date.</small>
				</th>

				<td>{attrs.successfulInitiativesCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives sent<br />
					<small>Initiatives sent from Rahvaalgatus.</small>
				</th>

				<td>
					<strong>{attrs.sentInitiativesCount.all}</strong>

					<ul>
						<li>{attrs.sentInitiativesCount.parliament} to Riigikogu.</li>
						<li>{attrs.sentInitiativesCount.local} to Local Governments.</li>
					</ul>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Authentications<br />
					<small>Includes logged out sessions.</small>
				</th>

				<td>
					<strong>{attrs.authenticationsCount.all}</strong>

					<ul>
						<li>{attrs.authenticationsCount.id_card} with Id-card.</li>
						<li>{attrs.authenticationsCount.mobile_id} with Mobile-Id.</li>
						<li>{attrs.authenticationsCount.smart_id} with Smart-Id.</li>
					</ul>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Signatures<br />

					<small>
						Counts initiative and user pairs.
						Excluded if deleted.
					</small>
				</th>

				<td>
					<strong>
						{attrs.signatureCount.all + attrs.citizenSignatureCount.all}
					</strong>

					<ul>
						<li>{attrs.signatureCount.parliament + attrs.citizenSignatureCount.parliament} to Riigikogu.</li>
						<li>{attrs.signatureCount.local + attrs.citizenSignatureCount.local} to Local Governments.</li>
					</ul>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Unique signers<br />

					<small>
						Unique signers for all initiatives. In case of anonymized signatures, counts unique gender and birthyear combos.
						Excluded if deleted.
					</small>
				</th>

				<td>{attrs.signerCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Signatures via Undersign.js<br />

					<small>
						Counts initiative and user pairs.
						Excluded if deleted.
					</small>
				</th>

				<td>
					<SignatureCountsView counts={attrs.signatureCount} />

					<ul>
						<li>{attrs.signatureCount.parliament} to Riigikogu.</li>
						<li>{attrs.signatureCount.local} to Local Governments.</li>
					</ul>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Signatures via CitizenOS<br />

					<small>
						Counts initiative and user pairs.
						Excluded if revoked.
					</small>
				</th>

				<td>
					<strong>{attrs.citizenSignatureCount.all}</strong>

					<ul>
						<li>{attrs.citizenSignatureCount.parliament} to Riigikogu.</li>
						<li>{attrs.citizenSignatureCount.local} to Local Governments.</li>
					</ul>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Unique subscriber count<br />
					<small>Confirmed subscribers. Counts unique emails.</small>
				</th>
				<td>{attrs.subscriberCount}</td>
			</tr>
		</tbody></table>

		<h2 class="admin-subheading">
			Last Subscriptions
			{" "}
			<span class="admin-count">({lastSubscriptions.length})</span>
		</h2>

		<SubscriptionsView req={attrs.req} subscriptions={lastSubscriptions} />
	</Page>
}

// TODO: Merge with the subscriptions page' SubscriptionsView.
function SubscriptionsView(attrs) {
	var {req} = attrs
	var {subscriptions} = attrs

	return <table class="admin-table subscriptions-table">
		<thead>
			<th>Subscribed At</th>
			<th>Confirmed At</th>
			<th>Initiative</th>
			<th>Person</th>
		</thead>

		<tbody>{subscriptions.map(function(subscription) {
			var destination = subscription.initiative_destination

			return <tr>
				<td>{formatDateTime("numeric", subscription.created_at)}</td>

				<td>{subscription.confirmed_at
					? formatDateTime("numeric", subscription.confirmed_at)
					: null
				}</td>

				<td>{subscription.initiative_id ?
					<a
						href={`${req.baseUrl}/initiatives/${subscription.initiative_id}`}
						class="admin-link"
					>
						{subscription.initiative_title}
					</a>
					: destination
					? <i>{LOCAL_GOVERNMENTS[destination].name} initiatives</i>
					: <i>All initiatives</i>
				}</td>

				<td>
					<a href={"mailto:" + subscription.email} class="admin-link">
						{subscription.email}
					</a>
					<br />
					<small>{subscription.created_ip}</small>
				</td>
			</tr>
		})}</tbody>
	</table>
}

function SignatureCountsView({counts}) {
	var timestampCost = Config.timemarkCost

	var idCardCosts = 0
	var idCardCount = counts.id_card + counts.id_card_oversigned
	var idCardTimestampCosts = idCardCount * timestampCost

	var mobileIdCount = counts.mobile_id + counts.mobile_id_oversigned
	var mobileIdCosts = mobileIdCount * Config.mobileIdCost
	var mobileIdTimestampCosts = mobileIdCount * timestampCost

	var smartIdCount = counts.smart_id + counts.smart_id_oversigned
	var smartIdCosts = smartIdCount * Config.smartIdCost
	var smartIdTimestampCosts = smartIdCount * timestampCost

	var allCount = counts.all + counts.all_oversigned
	var allCosts = idCardCosts + mobileIdCosts + smartIdCosts
	var allTimestampCosts = allCount * timestampCost

	return <table class="signature-counts-table admin-table">
		<thead>
			<tr>
				<th />
				<th>Count</th>
				<th>Costs</th>
				<th>Timestamp Costs</th>
				<th>Total</th>
			</tr>
		</thead>

		<tbody>
			<tr>
				<th>Total</th>

				<td>
					<strong>{allCount}</strong><br />
					{counts.all}{" "}current<br />
					{counts.all_oversigned}{" "}oversigned
				</td>

				<td>€{allCosts.toFixed(2)}</td>
				<td>€{allTimestampCosts.toFixed(2)}</td>
				<td>€{(allCosts + allTimestampCosts).toFixed(2)}</td>
			</tr>

			<tr>
				<th>Id-card</th>

				<td>
					<strong>{idCardCount}</strong><br />
					{counts.id_card}{" "}current<br />
					{counts.id_card_oversigned}{" "}oversigned
				</td>

				<td>€{idCardCosts.toFixed(2)}</td>

				<td>
					€{idCardTimestampCosts.toFixed(2)}<br />
					<small>€{timestampCost}/sig</small>
				</td>

				<td>€{(idCardCosts + idCardTimestampCosts).toFixed(2)}</td>
			</tr>

			<tr>
				<th>Mobile-Id</th>

				<td>
					<strong>{mobileIdCount}</strong><br />
					{counts.mobile_id}{" "}current<br />
					{counts.mobile_id_oversigned}{" "}oversigned
				</td>

				<td>
					€{mobileIdCosts.toFixed(2)}<br />
					<small>€{Config.mobileIdCost}/sig</small>
				</td>

				<td>
					€{mobileIdTimestampCosts.toFixed(2)}<br />
					<small>€{timestampCost}/sig</small>
				</td>

				<td>
					€{(mobileIdCosts + mobileIdTimestampCosts).toFixed(2)}
				</td>
			</tr>

			<tr>
				<th>Smart-Id</th>

				<td>
					<strong>{smartIdCount}</strong><br />
					{counts.smart_id}{" "}current<br />
					{counts.smart_id_oversigned}{" "}oversigned
				</td>

				<td>
					€{smartIdCosts.toFixed(2)}<br />
					<small>€{Config.smartIdCost}/sig</small>
				</td>

				<td>
					€{smartIdTimestampCosts.toFixed(2)}<br />
					<small>€{timestampCost}/sig</small>
				</td>

				<td>€{(smartIdCosts + smartIdTimestampCosts).toFixed(2)}</td>
			</tr>
		</tbody>
	</table>
}

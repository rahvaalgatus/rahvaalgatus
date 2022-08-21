/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("./page")
var {Form} = Page
var Config = require("root").config
var {formatDate} = require("root/lib/i18n")
var {formatDateTime} = require("root/lib/i18n")

module.exports = function(attrs) {
	var {req} = attrs
	var {from} = attrs
	var {to} = attrs
	var {lastSubscriptions} = attrs

	return <Page page="dashboard" title="Dashboard" req={req}>
		<h1 class="admin-heading">Dashboard</h1>

		<h2 class="admin-subheading">Overview</h2>

		<Form
			method="get"
			class="admin-inline-form overview-form"
			req={req}
		>
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
				<td>{attrs.publishedInitiativesCount}</td>
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
				<td>{attrs.signingStartedCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives passed {Config.votesRequired} signatures<br />
					<small>Milestone reached, regardless of creation date.</small>
				</th>

				<td>{attrs.successfulCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives sent<br />
					<small>Initiatives sent from Rahvaalgatus.</small>
				</th>

				<td>
					{attrs.sentCount.all}

					<ul>
						<li>{attrs.sentCount.parliament} to Riigikogu.</li>
						<li>{attrs.sentCount.local} to Local Governments.</li>
					</ul>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Authentications<br />
					<small>Includes logged out sessions.</small>
				</th>

				<td>
					{attrs.authenticationsCount.all}

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

				<td>{attrs.signatureCount.all + attrs.citizenSignatureCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Unique signers<br />

					<small>
						Unique signers for all initiatives.
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

				<td>{attrs.citizenSignatureCount}</td>
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

		<SubscriptionsView req={req} subscriptions={lastSubscriptions} />
	</Page>
}

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
			var {initiative} = subscription

			return <tr>
				<td>{formatDateTime("numeric", subscription.created_at)}</td>

				<td>{subscription.confirmed_at
					? formatDateTime("numeric", subscription.confirmed_at)
					: null
				}</td>

				<td>{initiative ?
					<a
						href={`${req.baseUrl}/initiatives/${initiative.uuid}`}
						class="admin-link">
						{initiative.title}
					</a>
				: <i>All initiatives</i>}</td>

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
	var idCardCosts = 0
	var mobileIdCosts = counts.mobile_id * Config.mobileIdCost
	var smartIdCosts = counts.smart_id * Config.smartIdCost
	var methodCosts = idCardCosts + mobileIdCosts + smartIdCosts

	var timestampCost = Config.timemarkCost
	var timestampCosts = counts.all * timestampCost

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
				<td>{counts.all}</td>
				<td>€{methodCosts.toFixed(2)}</td>
				<td>€{timestampCosts.toFixed(2)}</td>
				<td>€{(methodCosts + timestampCosts).toFixed(2)}</td>
			</tr>

			<tr>
				<th>Id-card</th>
				<td>{counts.id_card}</td>
				<td>€{idCardCosts.toFixed(2)}</td>

				<td>
					€{(counts.id_card * timestampCost).toFixed(2)}
					<br />
					<small>€{timestampCost}/sig</small>
				</td>

				<td>€{(idCardCosts + counts.id_card * timestampCost).toFixed(2)}</td>
			</tr>

			<tr>
				<th>Mobile-Id</th>
				<td>{counts.mobile_id}</td>

				<td>
					€{mobileIdCosts.toFixed(2)}
					<br />
					<small>€{Config.mobileIdCost}/sig</small>
				</td>

				<td>
					€{(counts.mobile_id * timestampCost).toFixed(2)}
					<br />
					<small>€{timestampCost}/sig</small>
				</td>

				<td>
					€{(mobileIdCosts + counts.mobile_id * timestampCost).toFixed(2)}
				</td>
			</tr>

			<tr>
				<th>Smart-Id</th>
				<td>{counts.smart_id}</td>

				<td>
					€{smartIdCosts.toFixed(2)}
					<br />
					<small>€{Config.smartIdCost}/sig</small>
				</td>

				<td>
					€{(counts.smart_id * timestampCost).toFixed(2)}
					<br />
					<small>€{timestampCost}/sig</small>
				</td>

				<td>€{(smartIdCosts + counts.smart_id * timestampCost).toFixed(2)}</td>
			</tr>
		</tbody>
	</table>
}

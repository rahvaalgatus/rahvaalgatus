/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var Config = require("root/config")
var formatDate = require("root/lib/i18n").formatDate
var EMPTY_ARR = Array.prototype

module.exports = function(attrs) {
	var req = attrs.req
	var initiatives = attrs.initiatives
	var subscriberCounts = attrs.subscriberCounts

	var initiativesByPhase = _.groupBy(initiatives, "phase")
	var inEdit = initiativesByPhase.edit || EMPTY_ARR
	var inSign = initiativesByPhase.sign || EMPTY_ARR
	var inParliament = initiativesByPhase.parliament || EMPTY_ARR
	var inGovernment = initiativesByPhase.government || EMPTY_ARR
	var inDone = initiativesByPhase.done || EMPTY_ARR

	return <Page page="initiatives" title="Initiatives" req={attrs.req}>
		<h1 class="admin-heading">Initiatives</h1>

		<h2 class="admin-subheading">
			Edit Phase
			{" "}
			<span class="admin-count">({inEdit.length})</span>
		</h2>

		<InitiativesView
			req={req}
			initiatives={inEdit}
			subscriberCounts={subscriberCounts}
		/>

		<h2 class="admin-subheading">
			Sign Phase
			{" "}
			<span class="admin-count">({inSign.length})</span>
		</h2>

		<InitiativesView
			req={req}
			initiatives={inSign}
			subscriberCounts={subscriberCounts}
		/>

		<h2 class="admin-subheading">
			Parliament Phase
			{" "}
			<span class="admin-count">({inParliament.length})</span>
		</h2>

		<InitiativesView
			req={req}
			initiatives={inParliament}
			subscriberCounts={subscriberCounts}
		/>

		<h2 class="admin-subheading">
			Government Phase
			{" "}
			<span class="admin-count">({inGovernment.length})</span>
		</h2>

		<InitiativesView
			req={req}
			initiatives={inGovernment}
			subscriberCounts={subscriberCounts}
		/>

		<h2 class="admin-subheading">
			Done Phase
			{" "}
			<span class="admin-count">({inDone.length})</span>
		</h2>

		<InitiativesView
			req={req}
			initiatives={inDone}
			subscriberCounts={subscriberCounts}
		/>
	</Page>
}

function InitiativesView(attrs) {
	var req = attrs.req
	var initiatives = attrs.initiatives
	var subscriberCounts = attrs.subscriberCounts
	var showSentTo = initiatives.some((i) => i.sent_to_parliament_at)
	var showFinishedIn = initiatives.some((i) => i.finished_in_parliament_at)
	var showSubscribers = initiatives.some((i) => subscriberCounts[i.uuid] > 0)

	return <table class="admin-table">
		<thead>
			<tr>
				{showSentTo ? <th>Sent to Parliament</th> : null}
				{showFinishedIn ? <th>Finished in Parliament</th> : null}
				<th>Title</th>
				{showSubscribers ? <th>Subscribers</th> : null}
				<th>On Rahvaalgatus</th>
			</tr>
		</thead>

		<tbody>
			{initiatives.map(function(initiative) {
				var initiativePath = `${req.baseUrl}/initiatives/${initiative.uuid}`
				return <tr>
					{showSentTo ? <td>{initiative.sent_to_parliament_at
						? formatDate("iso", initiative.sent_to_parliament_at)
						: null
					}</td> : null}

					{showFinishedIn ? <td>{initiative.finished_in_parliament_at
						? formatDate("iso", initiative.finished_in_parliament_at)
						: null
					}</td> : null}

					<td>
						<a href={initiativePath} class="admin-link">{initiative.title}</a>
					</td>

					{showSubscribers ? <td><a
						class="admin-link"
						href={`${initiativePath}/subscriptions`}>
						{subscriberCounts[initiative.uuid]}
					</a></td> : null}

					<td>
						<a
							href={Config.url + "/initiatives/" + initiative.uuid}
							class="admin-link"
						>View on Rahvaalgatus</a>
					</td>
				</tr>
			})}
		</tbody>
	</table>
}

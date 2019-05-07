/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var Config = require("root/config")
var formatDate = require("root/lib/i18n").formatDate

module.exports = function(attrs) {
	var req = attrs.req
	var votings = attrs.votings
	var parliamented = attrs.parliamented
	var closed = attrs.closed
	var dbInitiatives = attrs.dbInitiatives
	var subscriberCounts = attrs.subscriberCounts

	return <Page page="initiatives" title="Initiatives" req={attrs.req}>
		<h1 class="admin-heading">Initiatives</h1>

		<h2 class="admin-subheading">
			Voting
			{" "}
			<span class="admin-count">({votings.length})</span>
		</h2>

		<InitiativesView
			req={req}
			initiatives={votings}
			dbInitiatives={dbInitiatives}
			subscriberCounts={subscriberCounts}
		/>

		<h2 class="admin-subheading">
			In Parliament
			{" "}
			<span class="admin-count">({parliamented.length})</span>
		</h2>

		<InitiativesView
			req={req}
			initiatives={parliamented}
			dbInitiatives={dbInitiatives}
			subscriberCounts={subscriberCounts}
		/>

		<h2 class="admin-subheading">
			Finished
			{" "}
			<span class="admin-count">({closed.length})</span>
		</h2>

		<InitiativesView
			req={req}
			initiatives={closed}
			dbInitiatives={dbInitiatives}
			subscriberCounts={subscriberCounts}
		/>
	</Page>
}

function InitiativesView(attrs) {
	var req = attrs.req
	var initiatives = attrs.initiatives
	var dbInitiatives = attrs.dbInitiatives
	var subscriberCounts = attrs.subscriberCounts

	var showSentTo = initiatives.some((i) => (
		dbInitiatives[i.id].sent_to_parliament_at
	))

	var showFinishedIn = initiatives.some((i) => (
		dbInitiatives[i.id].finished_in_parliament_at
	))

	var showSubscribers = initiatives.some((i) => subscriberCounts[i.id] > 0)

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
				var dbInitiative = dbInitiatives[initiative.id]

				return <tr>
					{showSentTo ? <td>{dbInitiative.sent_to_parliament_at
						? formatDate("iso", dbInitiative.sent_to_parliament_at)
						: null
					}</td> : null}

					{showFinishedIn ? <td>{dbInitiative.finished_in_parliament_at
						? formatDate("iso", dbInitiative.finished_in_parliament_at)
						: null
					}</td> : null}

					<td>
						<a
							href={`${req.baseUrl}/initiatives/${initiative.id}`}
							class="admin-link">
							{initiative.title}
						</a>
					</td>

					{showSubscribers ? <td><a
						class="admin-link"
						href={`${req.baseUrl}/initiatives/${initiative.id}/subscriptions`}>
						{subscriberCounts[initiative.id]}
					</a></td> : null}

					<td>
						<a
							href={Config.url + "/initiatives/" + initiative.id}
							class="admin-link"
						>View on Rahvaalgatus</a>
					</td>
				</tr>
			})}
		</tbody>
	</table>
}

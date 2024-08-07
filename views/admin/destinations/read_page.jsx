/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var {Form} = Page
var {FormButton} = Page
var {formatDateTime} = require("root/lib/i18n")
var {confirm} = require("root/lib/jsx")

module.exports = function({
	req,
	destination,
	government: gov,
	signatureTrustees
}) {
	var [deletedSignatureTrustees, activeSignatureTrustees] = _.partition(
		signatureTrustees,
		"deleted_at"
	)

	var {flash} = req
	var destinationPath = req.baseUrl + "/" + destination
	var signatureTrusteesPath = destinationPath + "/signature-trustees"
	var rootPath = req.rootUrl

	return <Page page="destinations" title="Destinations" req={req}>
		<a href={req.baseUrl} class="admin-back">Destinations</a>
		<h1 class="admin-heading">{gov.name}</h1>

		<ul class="admin-overview-list">
			<li>
				<h2 class="label">Population</h2>
				<p class="value">{gov.population}</p>
			</li>

			<li>
				<h2 class="label">Voter Count</h2>
				<p class="value">{gov.voterCount}</p>
			</li>

			<li>
				<h2 class="label">Signature Threshold</h2>
				<p class="value">{gov.signatureThreshold}</p>
			</li>
		</ul>

		<table class="admin-horizontal-table">
			<tr>
				<th scope="row">Signature Emails</th>

				<td><ul>{gov.initiativesEmails.map((email) => <li>
					<a href={"mailto:" + email} class="admin-link">{email}</a>
				</li>)}</ul></td>
			</tr>
		</table>

		<h2 id="signature-trustees" class="admin-subheading">
			Signature Trustees
			{" "}
			<span class="admin-count">({signatureTrustees.length})</span>
		</h2>

		{flash("signatureTrusteeNotice") ? <p class="flash notice">
			{flash("signatureTrusteeNotice")}
		</p> : null}

		<table class="admin-table">
			<thead>
				<tr>
					<th>
						Created At<br />
						<small>Created By</small>
					</th>

					<th>Personal Id</th>
					<th>Name</th>

					<th>
						Deleted At<br />
						<small>Deleted By</small>
					</th>
				</tr>
			</thead>

			<tbody>{_.sortBy(activeSignatureTrustees, "created_at")
				.reverse()
				.map(renderSignatureTrusteeRow)
			}</tbody>

			{deletedSignatureTrustees.length > 0 ? <tbody>
				<tr class="admin-table-columns-header">
					<th colspan="4">Deleted Signature Trustees</th>
				</tr>

				{_.sortBy(deletedSignatureTrustees, "deleted_at")
					.reverse()
					.map(renderSignatureTrusteeRow)
				}
			</tbody> : null}

			<tfoot><tr>
				<td colspan="4"><Form
					req={req}
					class="admin-form --one-line"
					action={signatureTrusteesPath}
					method="post"
				>
					<label class="admin-form-field">
						<span class="admin-form-label">Personal Id</span>

						<input
							pattern="[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]"
							inputmode="numeric"
							required
							name="personal-id"
							class="admin-input"
						/>
					</label>

					<label class="admin-form-field">
						<span class="admin-form-label">Name</span>
						<input required name="name" class="admin-input" />
					</label>

					<button class="admin-submit">
						Add Signature Trustee
					</button>
				</Form></td>
			</tr></tfoot>
		</table>
	</Page>

	function renderSignatureTrusteeRow(trustee) {
		return <tr>
			<td>
				{formatDateTime("numeric", trustee.created_at)}<br />
				<small>Created by: <a href={rootPath + "/users/" + trustee.created_by_id} class="admin-link">{trustee.created_by_name}</a></small>
			</td>

			<td>{trustee.country}{" "}{trustee.personal_id}</td>
			<td>{trustee.name}</td>

			<td>{trustee.deleted_at ? <>
				{formatDateTime("numeric", trustee.deleted_at)}<br />
				<small>Deleted by: <a href={req.baseUrl + "/" + trustee.deleted_by_id} class="admin-link">{trustee.deleted_by_name}</a></small>
				</> : <FormButton
					req={req}
					action={signatureTrusteesPath + "/" + trustee.id}
					class="admin-link"
					onclick={confirm("Sure?")}
					name="_method"
					value="delete">
					Delete
				</FormButton>
			}</td>
		</tr>
	}
}

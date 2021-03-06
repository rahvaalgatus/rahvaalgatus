/** @jsx Jsx */
var Jsx = require("j6pack")
var {Form} = require("../../page")
var {FormButton} = require("../../page")
var {Flash} = require("../../page")
var {Fragment} = Jsx
var {Section} = require("../../page")
var {confirm} = require("root/lib/jsx")
var InitiativePage = require("../initiative_page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var flash = req.flash
	var initiative = attrs.initiative
	var coauthors = attrs.coauthors
	var initiativePath = "/initiatives/" + initiative.uuid
	var coauthorsPath = initiativePath + "/coauthors"

	var accepted = coauthors.filter((coauthor) => coauthor.status == "accepted")
	var pending = coauthors.filter((coauthor) => coauthor.status != "accepted")

	return <InitiativePage
		page="initiative-coauthors"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<Section class="initiative-section transparent-section">
			<div class="initiative-sheet">
				<Flash flash={flash} />

				<h2>{t("CO_AUTHORS")}</h2>
				<p class="description">{t("COAUTHORS_PAGE_DESCRIPTION")}</p>

				<table id="accepted-coauthors">
					<thead>
						<tr>
							<th>{t("COAUTHORS_PAGE_PERSONAL_ID")}</th>
							<th>{accepted.length > 0 ? t("COAUTHORS_PAGE_NAME") : null}</th>
							<th class="remove-column" />
						</tr>
					</thead>

					<tbody>
						{accepted.map(function(coauthor) {
							return <tr>
								<td>{coauthor.personal_id}</td>
								<td>{coauthor.user_name}</td>

								<td class="remove-column">
									<FormButton
										req={req}
										name="_method"
										value="delete"
										class="delete-button link-button"

										onclick={
											confirm(t("COAUTHORS_PAGE_REMOVE_BUTTON_CONFIRMATION"))
										}

										action={pathToCoauthor(coauthor)}
									>{t("COAUTHORS_PAGE_REMOVE_BUTTON")}</FormButton>
								</td>
							</tr>
						})}

						<tr class="add-row">
							<td colspan="3">
								<input
									type="checkbox"
									id="new-coauthor-toggle"
									checked={accepted.length == 0}
									hidden
								/>

								<label for="new-coauthor-toggle" class="link-button">{
									accepted.length == 0
										? t("COAUTHORS_PAGE_ADD_BUTTON")
										: t("COAUTHORS_PAGE_ADD_ANOTHER_BUTTON")
								}</label>

								<Form
									req={req}
									method="post"
									action={coauthorsPath}
									id="new-coauthor-form"
								>
									<label class="form-label">
										<input
											type="text"
											pattern="[0-9]*"
											inputmode="numeric"
											name="personalId"
											placeholder={t("PLACEHOLDER_PERSONAL_ID")}
											required
											class="form-input"
										/>
									</label>

									<button class="form-submit primary-button">
										{t("COAUTHORS_PAGE_ADD_BUTTON")}
									</button>
								</Form>
							</td>
						</tr>
					</tbody>
				</table>

				{pending.length > 0 ? <Fragment>
					<h3>{t("COAUTHORS_PAGE_SENT_INVITES")}</h3>

					<p class="description">
						{Jsx.html(t("COAUTHORS_PAGE_SENT_INVITES_DESCRIPTION", {
							initiativeUrl: initiativePath
						}))}
					</p>

					<table id="pending-coauthors">
						<thead>
							<tr>
								<th>{t("COAUTHORS_PAGE_PERSONAL_ID")}</th>
								<th class="remove-column" />
							</tr>
						</thead>

						<tbody>{pending.map(function(coauthor) {
							return <tr>
								<td>{coauthor.personal_id}</td>

								<td class="remove-column">
									<FormButton
										req={req}
										name="_method"
										value="delete"
										class="delete-button link-button"
										action={pathToCoauthor(coauthor)}
									>{t("COAUTHORS_PAGE_REMOVE_BUTTON")}</FormButton>
								</td>
							</tr>
						})}</tbody>
					</table>
				</Fragment> : null}
			</div>
		</Section>
	</InitiativePage>

	function pathToCoauthor(coauthor) {
		return coauthorsPath + "/" + coauthor.country + coauthor.personal_id
	}
}

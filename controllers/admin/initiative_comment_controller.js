var _ = require("root/lib/underscore")
var Filtering = require("root/lib/filtering")
var {Router} = require("express")
var commentsDb = require("root/db/comments_db")
var reportsDb = require("root/db/initiative_comment_reports_db")
var sql = require("sqlate")

exports.router = Router({mergeParams: true})

exports.router.get("/", function(req, res) {
	var filters = parseFilters(req.query)
	var limit = req.query.limit ? Number(req.query.limit) : 100
	var offset = req.query.offset ? Number(req.query.offset) : 0

	var [orderBy, orderDir] = req.query.order
		? Filtering.parseOrder(req.query.order)
		: ["id", "desc"]

	var orderDirSql = orderDir == "desc" ? sql`DESC` : sql`ASC`

	var filtersSql = sql`
		1 = 1

		${
			filters.walled === null ? sql`AND comment.walled IS NULL` :
			filters.walled === true ? sql`AND comment.walled` :
			filters.walled === false ? sql`AND NOT comment.walled` :
			sql``
		}
	`

	var comments = commentsDb.search(sql`
		SELECT
			comment.*,
			initiative.id AS initiative_id,
			initiative.slug AS initiative_slug,
			user.id AS user_id,
			user.name AS user_name,
			walled_by.name AS walled_by_name,

			json_group_array(json_object(
				'created_at', report.created_at,
				'created_by_id', report.created_by_id,
				'created_by_name', report_created_by.name
			)) AS reports

		FROM comments AS comment
		JOIN initiatives AS initiative ON initiative.uuid = comment.initiative_uuid
		JOIN users AS user ON comment.user_id = user.id

		LEFT JOIN users AS walled_by ON walled_by.id = comment.walled_by_id

		LEFT JOIN initiative_comment_reports AS report
		ON report.comment_id = comment.id

		LEFT JOIN users AS report_created_by
		ON report_created_by.id = report.created_by_id

		WHERE initiative.published_at IS NOT NULL
		AND ${filtersSql}
		GROUP BY comment.id

		${{
			"id": sql`ORDER BY comment.id ${orderDirSql}`,
			"report-count": sql`ORDER BY COUNT(report.id) ${orderDirSql}`
		}[orderBy] || sql``}

		${limit == null ? sql`` : sql`LIMIT ${limit}`}
		${offset == null ? sql`` : sql`OFFSET ${offset}`}
	`)

	comments.forEach(function(comment) {
		comment.reports = JSON.parse(comment.reports)
			.filter((report) => report.created_by_id)
			.map(reportsDb.parse)
	})

	var totalCount = commentsDb.select1(sql`
		SELECT COUNT(*) AS count FROM comments AS comment
		WHERE ${filtersSql}
	`).count

	res.render("admin/comments/index_page.jsx", {
		comments,
		totalCount,
		filters,
		order: [orderBy, orderDir],
		offset,
		limit
	})
})

exports.router.use("/:commentId", function(req, _res, next) {
	var id = req.params.commentId

	var comment = commentsDb.read(sql`
		SELECT
			comment.*,
			initiative.id AS initiative_id,
			initiative.title AS initiative_title,
			user.name AS user_name,
			walled_by.name AS walled_by_name

		FROM comments AS comment
		JOIN initiatives AS initiative ON initiative.uuid = comment.initiative_uuid
		JOIN users AS user ON comment.user_id = user.id

		LEFT JOIN users AS walled_by
		ON walled_by.id = comment.walled_by_id

		WHERE (comment.id = ${id} OR comment.uuid = ${id})
		AND initiative.published_at IS NOT NULL
	`)

	req.comment = comment
	next()
})

exports.router.get("/:commentId", function(req, res) {
	var {comment} = req

	var reports = reportsDb.search(sql`
		SELECT report.*, created_by.name AS created_by_name
		FROM initiative_comment_reports AS report
		JOIN users AS created_by ON created_by.id = report.created_by_id
		WHERE report.comment_id = ${comment.id}
		ORDER BY report.created_at ASC
	`)

	res.render("admin/comments/read_page.jsx", {comment, reports})
})

exports.router.put("/:commentId/walled", function(req, res) {
	var {comment} = req
	var walled = req.body.walled && _.parseBoolean(req.body.walled) || false

	commentsDb.update(comment, {
		walled,
		walled_at: new Date,
		walled_by_id: req.user.id
	})

	res.statusMessage = "Comment " + (walled ? "Walled" : "Unwalled")
	res.flash("notice", "Comment " + (walled ? "walled" : "unwalled") + ".")
	res.redirect(req.baseUrl + "/" + comment.id)
})

function parseFilters(query) {
	var filters = Filtering.parseFilters({walled: true}, query)

	if (filters.walled == "null")
		filters.walled = null
	else if (filters.walled != null)
		filters.walled = _.parseBoolean(filters.walled)

	return filters
}

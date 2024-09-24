var commentsDb = require("root/db/comments_db")
var reportsDb = require("root/db/initiative_comment_reports_db")
var {Router} = require("express")
var sql = require("sqlate")

exports.router = Router({mergeParams: true})

exports.router.get("/", function(req, res) {
	var limit = req.query.limit ? Number(req.query.limit) : 100
	var offset = req.query.offset ? Number(req.query.offset) : 0

	var reports = reportsDb.search(sql`
		SELECT
			initiative.id AS initiative_id,
			initiative.slug AS initiative_slug,
			comment.created_at AS comment_created_at,
			user.id AS user_id,
			user.name AS user_name

		FROM comments AS comment
		JOIN initiatives AS initiative ON initiative.uuid = comment.initiative_uuid
		JOIN users AS user ON comment.user_id = user.id

		ORDER BY created_at DESC
		${limit == null ? sql`` : sql`LIMIT ${limit}`}
		${offset == null ? sql`` : sql`OFFSET ${offset}`}
	`)

	var totalCount = commentsDb.select1(sql`
		SELECT COUNT(*) AS count FROM initiative_comment_reports
	`).count

	res.render("admin/comment-reports/index_page.jsx", {
		reports,
		totalCount,
		offset,
		limit
	})
})

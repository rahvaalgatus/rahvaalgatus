.dbconfig defensive off

BEGIN;

ALTER TABLE comments ADD COLUMN initiative_phase TEXT;

UPDATE comments SET initiative_phase = CASE
	WHEN comments.created_at >= initiative.signing_started_at THEN 'sign'
	WHEN comments.created_at >= initiative.sent_to_parliament_at THEN 'parliament'
	WHEN comments.created_at >= initiative.sent_to_government_at THEN 'government'

	WHEN comments.created_at >= COALESCE(
		initiative.finished_in_government_at,
		initiative.finished_in_parliament_at
	) THEN 'done'

	ELSE 'edit'
END

FROM (SELECT * FROM initiatives) AS initiative
WHERE initiative_uuid = initiative.uuid;

PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(sql,
	'initiative_phase TEXT',
	'initiative_phase TEXT NOT NULL'
)
WHERE name = 'comments';

PRAGMA writable_schema = RESET;

COMMIT;

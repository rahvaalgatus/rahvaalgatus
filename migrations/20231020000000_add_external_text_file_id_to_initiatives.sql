.dbconfig defensive off

BEGIN;

ALTER TABLE initiatives ADD COLUMN external_text_file_id INTEGER;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(sql,
	'FOREIGN KEY (user_id) REFERENCES users (id),',
	'FOREIGN KEY (user_id) REFERENCES users (id),
	FOREIGN KEY (external_text_file_id) REFERENCES initiative_files (id),'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = RESET;

CREATE INDEX index_initiatives_on_external_text_file_id
ON initiatives (external_text_file_id);

COMMIT;

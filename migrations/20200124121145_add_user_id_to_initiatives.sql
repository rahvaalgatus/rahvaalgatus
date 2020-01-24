ALTER TABLE initiatives
ADD COLUMN user_id INTEGER;

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'CONSTRAINT initiatives_uuid_length',
	'FOREIGN KEY (user_id) REFERENCES users (id),

	CONSTRAINT initiatives_uuid_length'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;

CREATE INDEX index_initiatives_on_user_id ON initiatives (user_id);

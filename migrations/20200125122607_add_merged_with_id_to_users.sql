ALTER TABLE users
ADD COLUMN merged_with_id INTEGER;

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'CONSTRAINT users_uuid_length CHECK (length(uuid) == 16)',
	'FOREIGN KEY (merged_with_id) REFERENCES users (id),

	CONSTRAINT users_uuid_length CHECK (length(uuid) == 16)'
)
WHERE name = 'users';

PRAGMA writable_schema = 0;

CREATE INDEX index_users_on_merged_with_id ON users (merged_with_id)
WHERE merged_with_id IS NOT NULL;

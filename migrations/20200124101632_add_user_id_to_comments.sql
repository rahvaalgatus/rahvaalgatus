ALTER TABLE comments
ADD COLUMN user_id INTEGER;

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'FOREIGN KEY (parent_id) REFERENCES comments (id),',
	'FOREIGN KEY (user_id) REFERENCES users (id),
	FOREIGN KEY (parent_id) REFERENCES comments (id),'
)
WHERE name = 'comments';

PRAGMA writable_schema = 0;

UPDATE comments SET user_id = (
	SELECT id FROM users AS user
	WHERE lower(hex(user.uuid)) = replace(comments.user_uuid, '-', '')
);

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'user_id INTEGER',
	'user_id INTEGER NOT NULL'
)
WHERE name = 'comments';

PRAGMA writable_schema = 0;

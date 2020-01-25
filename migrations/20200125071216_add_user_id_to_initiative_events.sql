ALTER TABLE initiative_events
ADD COLUMN user_id INTEGER;

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),',
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),
	FOREIGN KEY (user_id) REFERENCES users (id),'
)
WHERE name = 'initiative_events';

PRAGMA writable_schema = 0;

UPDATE initiative_events SET user_id = (
	SELECT id FROM users AS user
	WHERE lower(hex(user.uuid)) = replace(initiative_events.created_by, '-', '')
);

CREATE INDEX index_initiative_events_on_user_id ON initiative_events (user_id);

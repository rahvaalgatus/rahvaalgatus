ALTER TABLE initiative_images
ADD COLUMN uploaded_by_id INTEGER;

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE',
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE,
	FOREIGN KEY (uploaded_by_id) REFERENCES users (id)'
)
WHERE name = 'initiative_images';

PRAGMA writable_schema = 0;

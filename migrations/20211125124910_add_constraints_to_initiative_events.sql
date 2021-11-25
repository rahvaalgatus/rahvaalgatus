PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(sql,
	'CONSTRAINT initiative_events_title_length
	CHECK',
	'CONSTRAINT title_length CHECK'
)
WHERE name = 'initiative_events';

UPDATE sqlite_master
SET sql = replace(sql,
	'
	CONSTRAINT initiative_events_text_length
	CHECK',
	'	CONSTRAINT content_length CHECK'
)
WHERE name = 'initiative_events';

UPDATE sqlite_master
SET sql = replace(sql,
	'CONSTRAINT notified_at_format',

	'CONSTRAINT created_at_format CHECK (created_at GLOB ''*-*-*T*:*:*Z''),
	CONSTRAINT updated_at_format CHECK (updated_at GLOB ''*-*-*T*:*:*Z''),
	CONSTRAINT occurred_at_format CHECK (occurred_at GLOB ''*-*-*T*:*:*Z''),
	CONSTRAINT notified_at_format'
)
WHERE name = 'initiative_events';

UPDATE sqlite_master
SET sql = replace(sql,
	'CONSTRAINT content_length CHECK (length(content) > 0)',

	'CONSTRAINT content_length CHECK (length(content) > 0),
	CONSTRAINT origin_length CHECK (length(origin) > 0),
	CONSTRAINT external_id_length CHECK (length(external_id) > 0),
	CONSTRAINT type_length CHECK (length(type) > 0)'
)
WHERE name = 'initiative_events';

PRAGMA writable_schema = 0;

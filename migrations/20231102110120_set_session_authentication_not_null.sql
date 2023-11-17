.dbconfig defensive off

PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(sql,
	'authentication_id INTEGER UNIQUE',
	'authentication_id INTEGER NOT NULL UNIQUE'
)
WHERE name = 'sessions';

UPDATE sqlite_master
SET sql = replace(sql,
	'
	FOREIGN KEY (authentication_id) REFERENCES authentications (id)
	ON DELETE SET NULL',

	'	FOREIGN KEY (authentication_id) REFERENCES authentications (id)'
)
WHERE name = 'sessions';

PRAGMA writable_schema = RESET;

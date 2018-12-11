PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(sql, 'STRING', 'TEXT')
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;

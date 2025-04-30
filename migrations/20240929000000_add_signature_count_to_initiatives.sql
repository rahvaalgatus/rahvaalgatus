.dbconfig defensive off

BEGIN;

ALTER TABLE initiatives ADD COLUMN signature_count INTEGER NOT NULL DEFAULT 0;

PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(sql,
	'CONSTRAINT signature_milestones_json',
	'CONSTRAINT signature_count_nonnegative CHECK (signature_count >= 0),
	CONSTRAINT signature_milestones_json'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = RESET;

UPDATE initiatives AS initiative SET signature_count = (
	SELECT COUNT(*)
	FROM initiative_signatures
	WHERE initiative_uuid = initiative.uuid
) + (
	SELECT COUNT(*)
	FROM initiative_citizenos_signatures
	WHERE initiative_uuid = initiative.uuid
);

CREATE TRIGGER add_initiative_signature_count_on_signature_create
AFTER INSERT ON initiative_signatures
FOR EACH ROW BEGIN
  UPDATE initiatives SET signature_count = signature_count + 1
  WHERE uuid = NEW.initiative_uuid;
END;

CREATE TRIGGER add_initiative_signature_count_on_citizenos_signature_create
AFTER INSERT ON initiative_citizenos_signatures
FOR EACH ROW BEGIN
  UPDATE initiatives SET signature_count = signature_count + 1
  WHERE uuid = NEW.initiative_uuid;
END;

CREATE TRIGGER sub_initiative_signature_count_on_signature_create
AFTER DELETE ON initiative_signatures
FOR EACH ROW BEGIN
  UPDATE initiatives SET signature_count = signature_count - 1
  WHERE uuid = OLD.initiative_uuid;
END;

CREATE TRIGGER sub_initiative_signature_count_on_citizenos_signature_create
AFTER DELETE ON initiative_citizenos_signatures
FOR EACH ROW BEGIN
  UPDATE initiatives SET signature_count = signature_count - 1
  WHERE uuid = OLD.initiative_uuid;
END;

COMMIT;

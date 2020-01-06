ALTER TABLE initiative_signables
ADD COLUMN method TEXT;

ALTER TABLE initiative_signatures
ADD COLUMN method TEXT;

UPDATE initiative_signables
SET method = 'id-card';

UPDATE initiative_signatures
SET method = 'id-card';

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(sql, 'method TEXT', 'method TEXT NOT NULL')
WHERE name = 'initiative_signables';

UPDATE sqlite_master
SET sql = replace(sql, 'method TEXT', 'method TEXT NOT NULL')
WHERE name = 'initiative_signatures';

PRAGMA writable_schema = 0;

-- The majority of Mobile-Id certs have ESTEID (MOBIIL-ID) in their
-- subject name. That's an easy way to identify them in the PEM encoding of the
-- certificate. The newer ones with PNOEE-encoded common names don't.
--
-- for word in "TEID (MOBIIL-ID" "EID (MOBIIL-ID)" "ID (MOBIIL-I" "D (MOBIIL-ID"; do
--   echo -n "$word" | base64
-- done

UPDATE initiative_signables
SET method = 'mobile-id'
WHERE xades LIKE '%VEVJRCAoTU9CSUlMLUlE%'
OR xades LIKE '%RUlEIChNT0JJSUwtSUQp%'
OR xades LIKE '%SUQgKE1PQklJTC1J%'
OR xades LIKE '%RCAoTU9CSUlMLUlE%'
OR error LIKE '%MobileIdError%';

UPDATE initiative_signatures
SET method = 'mobile-id'
WHERE xades LIKE '%VEVJRCAoTU9CSUlMLUlE%'
OR xades LIKE '%RUlEIChNT0JJSUwtSUQp%'
OR xades LIKE '%SUQgKE1PQklJTC1J%'
OR xades LIKE '%RCAoTU9CSUlMLUlE%';

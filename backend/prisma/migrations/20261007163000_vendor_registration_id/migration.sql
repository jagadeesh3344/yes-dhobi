-- Partner login id, e.g. VD100001. Nullable so the column can be added to a
-- live table, then backfilled below before the unique index goes on.
ALTER TABLE "Vendor" ADD COLUMN "registrationId" TEXT;

-- The application mints new ids from this sequence (see src/lib/ids.ts).
CREATE SEQUENCE IF NOT EXISTS vendor_registration_seq START WITH 100001;

-- Give every partner that already exists an id, oldest application first.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn
  FROM "Vendor"
  WHERE "registrationId" IS NULL
)
UPDATE "Vendor" v
SET "registrationId" = 'VD' || (100000 + n.rn)::text
FROM numbered n
WHERE v.id = n.id;

-- Move the sequence past the backfilled ids so the next registration is unique.
SELECT setval(
  'vendor_registration_seq',
  (SELECT COALESCE(MAX(SUBSTRING("registrationId" FROM 3)::bigint), 100000) + 1
     FROM "Vendor"
    WHERE "registrationId" LIKE 'VD%'),
  false
);

CREATE UNIQUE INDEX "Vendor_registrationId_key" ON "Vendor"("registrationId");

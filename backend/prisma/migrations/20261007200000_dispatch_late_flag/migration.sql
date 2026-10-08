-- Marks a partner search that has already been reported to admins as late,
-- so the alert fires once rather than on every sweep.
ALTER TABLE "Dispatch" ADD COLUMN "lateFlaggedAt" TIMESTAMP(3);

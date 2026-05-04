-- ISO 17024 Cl.7.1 — Immutable scheme snapshots on certificates.
--
-- At the time a certificate is issued the current scheme name, code, and
-- standard version are captured and stored on the certificate row itself.
-- This ensures that a certificate issued under "ISO 17024:2012" remains
-- accurately described even if the scheme is later renamed or superseded.
-- Required for appeals reproducibility (Cl.6.1) — an auditor can always
-- determine which scheme version applied to a given certificate, even after
-- scheme data has been updated.

ALTER TABLE "certificates"
  ADD COLUMN IF NOT EXISTS "schemeNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "schemeCodeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "standardVersion" TEXT;

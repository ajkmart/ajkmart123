-- Migration 0047: Create compliance_checks table
-- Records the outcome of automated and manual compliance screenings
-- (CNIC, KYC, PEP, AML). Append-only for full audit history.
-- Previously handled by a runtime stub (ensureComplianceTables).

CREATE TABLE IF NOT EXISTS compliance_checks (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        REFERENCES users(id) ON DELETE CASCADE,
  check_type  TEXT        NOT NULL,
  result      TEXT        NOT NULL,
  score       INTEGER,
  details     JSONB,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_compliance_checks_user_id
  ON compliance_checks(user_id);

CREATE INDEX IF NOT EXISTS idx_compliance_checks_type_result
  ON compliance_checks(check_type, result);

CREATE INDEX IF NOT EXISTS idx_compliance_checks_checked_at
  ON compliance_checks(checked_at DESC);

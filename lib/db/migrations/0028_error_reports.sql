DO $$ BEGIN
  CREATE TYPE error_source_app AS ENUM ('customer', 'rider', 'vendor', 'admin', 'api');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE error_type AS ENUM ('frontend_crash', 'api_error', 'db_error', 'route_error', 'ui_error', 'unhandled_exception');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE error_severity AS ENUM ('critical', 'medium', 'minor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE error_status AS ENUM ('new', 'acknowledged', 'in_progress', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS error_reports (
  id              TEXT PRIMARY KEY,
  timestamp       TIMESTAMP NOT NULL DEFAULT NOW(),
  source_app      error_source_app NOT NULL,
  error_type      error_type NOT NULL,
  severity        error_severity NOT NULL,
  status          error_status NOT NULL DEFAULT 'new',
  function_name   TEXT,
  module_name     TEXT,
  component_name  TEXT,
  error_message   TEXT NOT NULL,
  short_impact    TEXT,
  stack_trace     TEXT,
  metadata        JSONB,
  resolved_at     TIMESTAMP,
  acknowledged_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_error_reports_timestamp ON error_reports (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_source_app ON error_reports (source_app);
CREATE INDEX IF NOT EXISTS idx_error_reports_severity ON error_reports (severity);
CREATE INDEX IF NOT EXISTS idx_error_reports_status ON error_reports (status);

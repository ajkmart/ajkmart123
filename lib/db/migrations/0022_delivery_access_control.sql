CREATE TABLE IF NOT EXISTS delivery_whitelist (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'active',
  valid_until TIMESTAMP,
  delivery_label TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_access_requests (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS system_audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT,
  admin_name TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS delivery_whitelist_type_target_service_idx ON delivery_whitelist(type, target_id, service_type);
CREATE INDEX IF NOT EXISTS delivery_whitelist_type_status_idx ON delivery_whitelist(type, status);
CREATE INDEX IF NOT EXISTS delivery_access_requests_vendor_idx ON delivery_access_requests(vendor_id);
CREATE INDEX IF NOT EXISTS delivery_access_requests_status_idx ON delivery_access_requests(status);
CREATE INDEX IF NOT EXISTS system_audit_log_action_idx ON system_audit_log(action);

-- =============================================================
-- Irrigation rules (phase 3) - dry-run recommendation engine
-- =============================================================

CREATE TABLE IF NOT EXISTS irrigation_rules (
    id                    SERIAL       PRIMARY KEY,
    name                  VARCHAR(150) NOT NULL,
    enabled               BOOLEAN      NOT NULL DEFAULT TRUE,
    dry_run               BOOLEAN      NOT NULL DEFAULT TRUE,
    priority              INTEGER      NOT NULL DEFAULT 100,
    scope_type            VARCHAR(16)  NOT NULL DEFAULT 'global'
                                       CHECK (scope_type IN ('global', 'tenant', 'site', 'device')),
    tenant_id             INTEGER      REFERENCES tenants(id) ON DELETE CASCADE,
    site_id               INTEGER      REFERENCES sites(id) ON DELETE CASCADE,
    device_id             VARCHAR(50)  REFERENCES devices(id) ON DELETE CASCADE,
    trigger_below_weight  FLOAT        NOT NULL,
    stop_above_weight     FLOAT,
    hysteresis            FLOAT        NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_irrigation_rules_scope
  ON irrigation_rules (scope_type, tenant_id, site_id, device_id, enabled, priority);

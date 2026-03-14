-- =============================================================
-- Platform configuration for reusable deployments
-- =============================================================

CREATE TABLE IF NOT EXISTS platform_config (
    section     VARCHAR(32) PRIMARY KEY,
    config      JSONB       NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- Phase 4 control safety: lockouts + command queue
-- =============================================================

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS control_locked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS max_irrigation_on_seconds INTEGER NOT NULL DEFAULT 900;

CREATE TABLE IF NOT EXISTS command_queue (
    id             BIGSERIAL    PRIMARY KEY,
    device_id      VARCHAR(50)  NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    command_type   VARCHAR(64)  NOT NULL,
    payload        JSONB        NOT NULL,
    requested_by   VARCHAR(100) NOT NULL,
    status         VARCHAR(20)  NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent', 'acked', 'failed', 'cancelled')),
    attempts       INTEGER      NOT NULL DEFAULT 0,
    max_attempts   INTEGER      NOT NULL DEFAULT 3,
    correlation_id VARCHAR(64)  NOT NULL,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at        TIMESTAMPTZ,
    acked_at       TIMESTAMPTZ,
    last_error     TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_command_queue_correlation
  ON command_queue(correlation_id);

CREATE INDEX IF NOT EXISTS idx_command_queue_status_next_attempt
  ON command_queue(status, next_attempt_at);

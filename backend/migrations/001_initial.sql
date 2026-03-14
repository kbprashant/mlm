-- =============================================================
-- ESP32 Irrigation Monitoring Platform – PostgreSQL Schema
-- =============================================================

-- Device registry
CREATE TABLE IF NOT EXISTS devices (
    id                    VARCHAR(50)  PRIMARY KEY,
    name                  VARCHAR(100) NOT NULL DEFAULT '',
    description           TEXT         NOT NULL DEFAULT '',
    logging_enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
    weight_loss_threshold FLOAT        NOT NULL DEFAULT 50.0,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Event log
CREATE TABLE IF NOT EXISTS events (
    id          BIGSERIAL    PRIMARY KEY,
    device_id   VARCHAR(50)  NOT NULL,
    event_type  VARCHAR(50)  NOT NULL,
    message     TEXT         NOT NULL DEFAULT '',
    metadata    JSONB        NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_device_time   ON events (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type_time     ON events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_created_at    ON events (created_at DESC);

-- Users (authentication)
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL       PRIMARY KEY,
    username      VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'viewer'
                               CHECK (role IN ('admin', 'viewer')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================
-- Reference: event_type values used in the application
-- =============================================================
-- device_registered   – auto-created when first message arrives
-- device_online       – device reconnected
-- device_offline      – no message for > 10 seconds
-- irrigation_on       – irrigation_status changed to ON
-- irrigation_off      – irrigation_status changed to OFF
-- threshold_reached   – weight dropped below configured threshold
-- tare_command        – tare sent by user
-- calibration_start   – calibrate command sent
-- calibration_complete– confirmed by ESP32 (if implemented)
-- logging_changed     – logging enabled/disabled
-- =============================================================

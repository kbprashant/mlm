'use strict'

const { randomUUID } = require('crypto')
const { pool } = require('../config/db')
const { getConfigSection, DEFAULTS } = require('./platformConfigService')

let workerStarted = false

async function logEvent (deviceId, eventType, message, metadata = {}) {
  try {
    const row = await pool.query(
      'INSERT INTO events (device_id, event_type, message, metadata) VALUES ($1,$2,$3,$4) RETURNING *',
      [deviceId, eventType, message, JSON.stringify(metadata)]
    )
    const { broadcast } = require('./wsService')
    broadcast({ type: 'event', data: row.rows[0] })
  } catch (err) {
    console.error('[queue] logEvent error:', err.message)
  }
}

async function initCommandQueue () {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS command_queue (
      id              BIGSERIAL    PRIMARY KEY,
      device_id       VARCHAR(50)  NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      command_type    VARCHAR(64)  NOT NULL,
      payload         JSONB        NOT NULL,
      requested_by    VARCHAR(100) NOT NULL,
      status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'sent', 'acked', 'failed', 'cancelled')),
      attempts        INTEGER      NOT NULL DEFAULT 0,
      max_attempts    INTEGER      NOT NULL DEFAULT 3,
      correlation_id  VARCHAR(64)  NOT NULL,
      next_attempt_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      sent_at         TIMESTAMPTZ,
      acked_at        TIMESTAMPTZ,
      last_error      TEXT,
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `)
}

async function enqueueCommand ({ deviceId, commandType, payload, requestedBy }) {
  const rules = await getConfigSection('rules')
  const maxAttempts = Number(rules.command_max_retries || DEFAULTS.rules.command_max_retries || 3)
  const correlationId = randomUUID().replace(/-/g, '')

  const payloadWithId = {
    ...(payload || {}),
    command_id: correlationId
  }

  const result = await pool.query(
    `INSERT INTO command_queue
     (device_id, command_type, payload, requested_by, status, attempts, max_attempts, correlation_id)
     VALUES ($1,$2,$3,$4,'pending',0,$5,$6)
     RETURNING *`,
    [deviceId, commandType, JSON.stringify(payloadWithId), requestedBy, maxAttempts, correlationId]
  )

  await logEvent(deviceId, 'command_queued', `Command '${commandType}' queued by ${requestedBy}`, {
    correlation_id: correlationId,
    command_type: commandType
  })

  return result.rows[0]
}

async function markCommandAcked (deviceId, correlationId, rawPayload) {
  if (!correlationId) return false
  const result = await pool.query(
    `UPDATE command_queue
     SET status = 'acked', acked_at = NOW(), updated_at = NOW()
     WHERE correlation_id = $1 AND device_id = $2 AND status IN ('pending', 'sent')
     RETURNING *`,
    [correlationId, deviceId]
  )

  if (result.rows.length === 0) return false

  await logEvent(deviceId, 'command_ack', `Command ack received (${correlationId})`, {
    correlation_id: correlationId,
    payload: rawPayload
  })
  return true
}

async function processRetryTimeouts (rules) {
  const requireAck = Boolean(rules.command_require_ack)
  if (!requireAck) return

  const ackTimeoutMs = Number(rules.command_ack_timeout_ms || DEFAULTS.rules.command_ack_timeout_ms || 20000)
  const retryIntervalMs = Number(rules.command_retry_interval_ms || DEFAULTS.rules.command_retry_interval_ms || 8000)

  const result = await pool.query(
    `SELECT id, attempts, max_attempts
     FROM command_queue
     WHERE status = 'sent' AND sent_at < NOW() - ($1::int * INTERVAL '1 millisecond')`,
    [ackTimeoutMs]
  )

  for (const row of result.rows) {
    if (row.attempts >= row.max_attempts) {
      await pool.query(
        `UPDATE command_queue
         SET status = 'failed', updated_at = NOW(), last_error = 'Ack timeout'
         WHERE id = $1`,
        [row.id]
      )
      continue
    }

    await pool.query(
      `UPDATE command_queue
       SET status = 'pending',
           next_attempt_at = NOW() + ($1::int * INTERVAL '1 millisecond'),
           updated_at = NOW(),
           last_error = 'Ack timeout; retry scheduled'
       WHERE id = $2`,
      [retryIntervalMs, row.id]
    )
  }
}

async function processQueueBatch () {
  const rules = await getConfigSection('rules')
  await processRetryTimeouts(rules)

  const retryIntervalMs = Number(rules.command_retry_interval_ms || DEFAULTS.rules.command_retry_interval_ms || 8000)

  const pending = await pool.query(
    `SELECT *
     FROM command_queue
     WHERE status = 'pending' AND next_attempt_at <= NOW()
     ORDER BY id ASC
     LIMIT 20`
  )

  for (const command of pending.rows) {
    try {
      const { publishCommand } = require('./mqttService')
      await publishCommand(command.device_id, command.payload)
      await pool.query(
        `UPDATE command_queue
         SET status = 'sent', attempts = attempts + 1, sent_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [command.id]
      )
      await logEvent(command.device_id, 'command_sent', `Command '${command.command_type}' sent`, {
        correlation_id: command.correlation_id,
        command_id: command.id
      })
    } catch (error) {
      const failedResult = await pool.query(
        `UPDATE command_queue
         SET attempts = attempts + 1,
             status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
             next_attempt_at = NOW() + ($2::int * INTERVAL '1 millisecond'),
             updated_at = NOW(),
             last_error = $3
         WHERE id = $1
         RETURNING *`,
        [command.id, retryIntervalMs, error.message]
      )

      const updated = failedResult.rows[0]
      const ev = updated.status === 'failed' ? 'command_failed' : 'command_retry_scheduled'
      await logEvent(command.device_id, ev, `Command '${command.command_type}' ${updated.status}`, {
        correlation_id: command.correlation_id,
        attempts: updated.attempts,
        max_attempts: updated.max_attempts,
        error: error.message
      })
    }
  }
}

function startCommandQueueWorker () {
  if (workerStarted) return
  workerStarted = true

  setInterval(() => {
    processQueueBatch().catch((error) => {
      console.error('[queue] worker loop error:', error.message)
    })
  }, 2000)
}

async function getQueueStats () {
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM command_queue
     GROUP BY status`
  )

  const stats = {
    pending: 0,
    sent: 0,
    acked: 0,
    failed: 0,
    cancelled: 0,
    worker_started: workerStarted
  }

  for (const row of result.rows) {
    stats[row.status] = row.count
  }
  return stats
}

async function listCommands ({ status, limit = 100, offset = 0 }) {
  if (status) {
    const result = await pool.query(
      `SELECT * FROM command_queue
       WHERE status = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    )
    return result.rows
  }

  const result = await pool.query(
    `SELECT * FROM command_queue
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
  return result.rows
}

module.exports = {
  initCommandQueue,
  enqueueCommand,
  markCommandAcked,
  startCommandQueueWorker,
  listCommands,
  getQueueStats
}

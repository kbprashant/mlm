'use strict'
const express  = require('express')
const { body, query, validationResult } = require('express-validator')
const { pool }           = require('../config/db')
const { requireAdmin }   = require('../middleware/auth')
const { enqueueCommand, listCommands } = require('../services/commandQueueService')

const router = express.Router()

router.get('/queue',
  requireAdmin,
  query('status').optional().isIn(['pending', 'sent', 'acked', 'failed', 'cancelled']),
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  query('offset').optional().isInt({ min: 0 }),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    const limit = Math.min(Math.max(parseInt(req.query.limit || '100', 10), 1), 1000)
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0)

    try {
      const commands = await listCommands({ status: req.query.status, limit, offset })
      res.json({ commands, limit, offset })
    } catch (error) {
      console.error('[commands] queue list error:', error.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// POST /api/commands/:deviceId
router.post('/:deviceId',
  requireAdmin,
  body('command').isIn(['tare', 'calibrate', 'irrigation_on', 'irrigation_off']),
  body('reference_weight').optional().isFloat({ min: 0.001 }),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    const { deviceId } = req.params
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(deviceId)) {
      return res.status(400).json({ error: 'Invalid device ID' })
    }

    const { command, reference_weight } = req.body
    if (command === 'calibrate' && !reference_weight) {
      return res.status(400).json({ error: 'reference_weight is required for calibrate' })
    }

    const deviceResult = await pool.query('SELECT id, control_locked FROM devices WHERE id = $1', [deviceId])
    if (deviceResult.rows.length === 0) return res.status(404).json({ error: 'Device not found' })
    if (deviceResult.rows[0].control_locked) {
      return res.status(423).json({ error: 'Device control is locked' })
    }

    let payload
    if (command === 'calibrate') {
      payload = { command, reference_weight }
    } else if (command === 'irrigation_on') {
      payload = { command: 'irrigation', state: 'ON' }
    } else if (command === 'irrigation_off') {
      payload = { command: 'irrigation', state: 'OFF' }
    } else {
      payload = { command }
    }

    try {
      const queued = await enqueueCommand({
        deviceId,
        commandType: command,
        payload,
        requestedBy: req.user.username
      })

      const eventType = command === 'tare'
        ? 'tare_command'
        : command === 'calibrate'
          ? 'calibration_start'
          : 'calibrate_command'
      const message   = command === 'tare'
        ? `Tare sent by ${req.user.username}`
        : command === 'calibrate'
          ? `Calibration queued by ${req.user.username} (ref: ${reference_weight} g)`
          : `${command} queued by ${req.user.username}`

      await pool.query(
        'INSERT INTO events (device_id, event_type, message, metadata) VALUES ($1,$2,$3,$4)',
        [deviceId, eventType, message, JSON.stringify({ payload, user: req.user.username, queue_id: queued.id })]
      )

      res.json({
        success: true,
        queued: true,
        command_id: queued.id,
        correlation_id: queued.correlation_id,
        message: `Command '${command}' queued for ${deviceId}`
      })
    } catch (err) {
      console.error('[commands] error:', err.message)
      res.status(503).json({ error: 'Failed to queue command: ' + err.message })
    }
  }
)

module.exports = router

'use strict'
const express  = require('express')
const { pool } = require('../config/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

const ALLOWED_TYPES = new Set([
  'irrigation_on','irrigation_off','device_online','device_offline',
  'threshold_reached','calibration_start','calibration_complete',
  'logging_changed','device_registered','tare_command','calibrate_command',
  'rule_recommendation_on','rule_recommendation_off',
  'command_queued','command_sent','command_ack','command_failed','command_retry_scheduled',
  'irrigation_safety_cutoff',
])

// GET /api/events?device_id=WS_001&type=irrigation_on&limit=100&offset=0
router.get('/', requireAuth, async (req, res) => {
  const { device_id, type, limit = 100, offset = 0 } = req.query

  const safeLimit  = Math.min(Math.max(1, parseInt(limit, 10) || 100), 1000)
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0)

  const conditions = []
  const values     = []
  let   p          = 1

  if (device_id) {
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(device_id)) {
      return res.status(400).json({ error: 'Invalid device_id' })
    }
    conditions.push(`device_id = $${p++}`)
    values.push(device_id)
  }

  if (type) {
    if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ error: 'Invalid event type' })
    conditions.push(`event_type = $${p++}`)
    values.push(type)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const [data, count] = await Promise.all([
      pool.query(
        `SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p + 1}`,
        [...values, safeLimit, safeOffset]
      ),
      pool.query(`SELECT COUNT(*) FROM events ${where}`, values),
    ])
    res.json({
      events: data.rows,
      total:  parseInt(count.rows[0].count, 10),
      limit:  safeLimit,
      offset: safeOffset,
    })
  } catch (err) {
    console.error('[events] query error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router

'use strict'

const express = require('express')
const { pool } = require('../config/db')
const { requireAdmin } = require('../middleware/auth')
const { getMqttStatus } = require('../services/mqttService')
const { getQueueStats } = require('../services/commandQueueService')

const router = express.Router()

router.get('/status', requireAdmin, async (_req, res) => {
  try {
    const dbStart = Date.now()
    await pool.query('SELECT 1')
    const dbLatencyMs = Date.now() - dbStart

    const mqtt = getMqttStatus()
    const queue = await getQueueStats()

    res.json({
      now: new Date().toISOString(),
      db: {
        ok: true,
        latency_ms: dbLatencyMs
      },
      mqtt,
      queue,
      ready: mqtt.connected
    })
  } catch (error) {
    console.error('[system] status error:', error.message)
    res.status(500).json({
      now: new Date().toISOString(),
      db: { ok: false },
      ready: false,
      error: error.message
    })
  }
})

module.exports = router

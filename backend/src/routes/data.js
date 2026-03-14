'use strict'
const express     = require('express')
const { influx }  = require('../config/influx')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

const ALLOWED_RANGES = new Set(['10m', '1h', '24h', '7d'])

/** Sanitise a device ID to prevent InfluxQL injection */
function safeId (id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,50}$/.test(id)) return null
  return id
}

function buildTimeFilter (range, from, to) {
  if (from && to) {
    const f = Date.parse(from)
    const t = Date.parse(to)
    if (isNaN(f) || isNaN(t) || f >= t) return null
    return `time >= '${new Date(f).toISOString()}' AND time <= '${new Date(t).toISOString()}'`
  }
  const r = ALLOWED_RANGES.has(range) ? range : '1h'
  return `time > now() - ${r}`
}

// GET /api/data/:deviceId?range=1h  (or ?from=...&to=... for custom)
router.get('/:deviceId', requireAuth, async (req, res) => {
  const deviceId = safeId(req.params.deviceId)
  if (!deviceId) return res.status(400).json({ error: 'Invalid device ID' })

  const timeFilter = buildTimeFilter(req.query.range, req.query.from, req.query.to)
  if (!timeFilter) return res.status(400).json({ error: 'Invalid time range' })

  try {
    const rows = await influx.query(
      `SELECT time, weight, irrigation_status
       FROM irrigation_readings
       WHERE device_id = '${deviceId}' AND ${timeFilter}
       ORDER BY time ASC
       LIMIT 10000`
    )
    res.json(rows)
  } catch (err) {
    console.error('[data] InfluxDB query error:', err.message)
    res.status(500).json({ error: 'Database query failed' })
  }
})

// GET /api/data/:deviceId/export?range=24h&format=csv|excel
router.get('/:deviceId/export', requireAuth, async (req, res) => {
  const deviceId = safeId(req.params.deviceId)
  if (!deviceId) return res.status(400).json({ error: 'Invalid device ID' })

  const { format = 'csv' }  = req.query
  if (!['csv', 'excel'].includes(format)) return res.status(400).json({ error: 'format must be csv or excel' })

  const timeFilter = buildTimeFilter(req.query.range || '24h', req.query.from, req.query.to)
  if (!timeFilter) return res.status(400).json({ error: 'Invalid time range' })

  try {
    const rows = await influx.query(
      `SELECT time, weight, irrigation_status
       FROM irrigation_readings
       WHERE device_id = '${deviceId}' AND ${timeFilter}
       ORDER BY time ASC`
    )

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${deviceId}.csv"`)
      res.write('timestamp,weight_g,irrigation_status\n')
      for (const row of rows) {
        res.write(`${row.time},${row.weight},${row.irrigation_status || 'OFF'}\n`)
      }
      return res.end()
    }

    // Excel
    const ExcelJS = require('exceljs')
    const wb      = new ExcelJS.Workbook()
    wb.creator     = 'Irrigation Platform'
    const ws = wb.addWorksheet(deviceId)
    ws.columns = [
      { header: 'Timestamp',         key: 'time',   width: 25 },
      { header: 'Weight (g)',         key: 'weight', width: 15 },
      { header: 'Irrigation Status',  key: 'irr',    width: 18 },
    ]
    for (const row of rows) {
      ws.addRow({ time: new Date(row.time).toISOString(), weight: row.weight, irr: row.irrigation_status || 'OFF' })
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${deviceId}.xlsx"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('[data] export error:', err.message)
    res.status(500).json({ error: 'Export failed' })
  }
})

module.exports = router

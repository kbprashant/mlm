'use strict'
require('dotenv').config()

const http = require('http')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')

const { initDb } = require('./config/db')
const { pool } = require('./config/db')
const { startMqttService } = require('./services/mqttService')
const { initWsServer } = require('./services/wsService')
const { initPlatformConfig } = require('./services/platformConfigService')
const { initIrrigationRules } = require('./services/irrigationRulesService')
const { initCommandQueue, startCommandQueueWorker } = require('./services/commandQueueService')

const authRoutes = require('./routes/auth')
const deviceRoutes = require('./routes/devices')
const dataRoutes = require('./routes/data')
const eventsRoutes = require('./routes/events')
const commandsRoutes = require('./routes/commands')
const legacyRoutes = require('./routes/legacy')
const configRoutes = require('./routes/config')
const tenantsRoutes = require('./routes/tenants')
const sitesRoutes = require('./routes/sites')
const rulesRoutes = require('./routes/rules')
const systemRoutes = require('./routes/system')
const { getMqttStatus } = require('./services/mqttService')

const app = express()
const server = http.createServer(app)

// ── Security middleware ──────────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
app.use(express.json({ limit: '16kb' }))

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
})
app.use('/api', apiLimiter)

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/devices', deviceRoutes)
app.use('/api/data', dataRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/commands', commandsRoutes)
app.use('/api/legacy', legacyRoutes)
app.use('/api/config', configRoutes)
app.use('/api/tenants', tenantsRoutes)
app.use('/api/sites', sitesRoutes)
app.use('/api/rules', rulesRoutes)
app.use('/api/system', systemRoutes)

app.get('/health/live', (_req, res) => {
  res.json({ status: 'live', uptime: process.uptime(), ts: new Date().toISOString() })
})

app.get('/health/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    const mqtt = getMqttStatus()
    if (!mqtt.connected) {
      return res.status(503).json({ status: 'not_ready', reason: 'mqtt_disconnected', ts: new Date().toISOString() })
    }
    res.json({ status: 'ready', ts: new Date().toISOString() })
  } catch (error) {
    res.status(503).json({ status: 'not_ready', reason: error.message, ts: new Date().toISOString() })
  }
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: new Date().toISOString(), endpoints: ['/health/live', '/health/ready'] })
})

// ── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// ── Error handler ────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

// ── Bootstrap ────────────────────────────────────────────────
async function start () {
  await initDb()
  await initPlatformConfig()
  await initIrrigationRules()
  await initCommandQueue()
  initWsServer(server)
  await startMqttService()
  startCommandQueueWorker()
  const PORT = parseInt(process.env.PORT || '3001', 10)
  server.listen(PORT, () => console.log(`Backend listening on port ${PORT}`))
}

start().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})

'use strict'
const WebSocket = require('ws')
const jwt       = require('jsonwebtoken')

let wss = null

function initWsServer (httpServer) {
  wss = new WebSocket.Server({ server: httpServer, path: '/ws' })

  wss.on('connection', (ws) => {
    ws.isAuthenticated = false
    ws.isAlive = true

    ws.on('pong', () => { ws.isAlive = true })

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type !== 'auth') return
        try {
          const payload = jwt.verify(msg.token, process.env.JWT_SECRET)
          ws.isAuthenticated = true
          ws.userId = payload.id
          ws.send(JSON.stringify({ type: 'auth_ok', user: { id: payload.id, username: payload.username, role: payload.role } }))
        } catch {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }))
          ws.close(4001, 'Unauthorized')
        }
      } catch { /* ignore malformed messages */ }
    })

    ws.on('error', (err) => console.error('[ws] client error:', err.message))
  })

  // Heartbeat – drop dead connections every 30 s
  const heartbeat = setInterval(() => {
    if (!wss) return
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) { ws.terminate(); return }
      ws.isAlive = false
      ws.ping()
    })
  }, 30_000)

  wss.on('close', () => clearInterval(heartbeat))
  console.log('[ws] WebSocket server ready on /ws')
}

/**
 * Broadcast a JSON message to all authenticated clients.
 * Serialises only once regardless of client count.
 */
function broadcast (message) {
  if (!wss) return
  let payload = null  // lazy serialise
  wss.clients.forEach((ws) => {
    if (ws.readyState !== WebSocket.OPEN || !ws.isAuthenticated) return
    if (!payload) payload = JSON.stringify(message)
    ws.send(payload)
  })
}

module.exports = { initWsServer, broadcast }

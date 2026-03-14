'use strict'
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
})

pool.on('error', (err) => {
  console.error('[postgres] Unexpected pool error:', err.message)
})

async function initDb () {
  const client = await pool.connect()
  try {
    await client.query('SELECT 1')
    console.log('[postgres] Connected')
  } finally {
    client.release()
  }
}

module.exports = { pool, initDb }

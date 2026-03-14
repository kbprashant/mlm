'use strict'
const Influx = require('influx')

const influx = new Influx.InfluxDB({
  host: process.env.INFLUX_HOST || 'localhost',
  port: parseInt(process.env.INFLUX_PORT || '8086', 10),
  database: process.env.INFLUX_DATABASE || 'telegraf',
  ...(process.env.INFLUX_USERNAME && {
    username: process.env.INFLUX_USERNAME,
    password: process.env.INFLUX_PASSWORD || '',
  }),
  options: { timeout: 10_000 },
})

module.exports = { influx }

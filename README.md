# ESP32 Irrigation Monitoring Platform

Production-grade real-time web platform for monitoring and controlling ESP32 weight-based irrigation devices.
Supports up to **1,000 devices** sending data every second. Reuses the existing Mosquitto + InfluxDB + PostgreSQL infrastructure.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ESP32 Devices  (up to 1,000)                         │
│          MQTT publish every 1s  →  devices/{device_id}/data             │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────┐
                   │   Mosquitto MQTT Broker   │
                   │    (port 1883 / 9001 ws)  │
                   └──────────┬───────────────┘
                    ┌─────────┤
                    │         │
                    ▼         ▼
        ┌───────────────┐  ┌─────────────────────────────────────────┐
        │   Telegraf    │  │     Backend  –  Node.js  (port 3001)    │
        │  MQTT→Influx  │  │                                         │
        └───────┬───────┘  │  ┌──────────────┐  ┌────────────────┐  │
                │           │  │ MQTT Service │  │  WS Server     │  │
                ▼           │  │  subscribe   │  │  (batch 1 s)   │  │
       ┌──────────────┐     │  └──────┬───────┘  └───────┬────────┘  │
       │  InfluxDB v1 │     │         │ update            │ broadcast │
       │  :8086       │◄────┤  ┌──────▼──────────────────┘           │
       │  DB:telegraf │     │  │  DeviceStore  (in-memory Map)        │
       │  meas:        │     │  └─────────────────────────────────────┘
       │  irrigation_ │     │                                         │
       │  readings    │◄────┤  ┌──────────────────────────────────────┤
       └──────────────┘     │  │     REST API  (Express)              │
                            │  │  /api/devices  /api/data             │
                            │  │  /api/events   /api/commands         │
       ┌──────────────┐     │  └──────────────────────────────────────┤
       │ PostgreSQL   │◄────┤  Device registry, events, users         │
       │  :5432       │     │                                         │
       └──────────────┘     └─────────────────────────────────────────┘
                                              │
                              WebSocket (ws://) + REST (http://)
                                              │
                    ┌─────────────────────────▼───────────────────────────┐
                    │        Next.js Dashboard  (port 3000)               │
                    │                                                     │
                    │  ┌───────────────────────────────────────────────┐  │
                    │  │  Real-time DeviceGrid    (windowed – 1,000)   │  │
                    │  │  Weight Charts           (recharts)           │  │
                    │  │  Event Log                                    │  │
                    │  │  Device Settings & Command Panel              │  │
                    │  └───────────────────────────────────────────────┘  │
                    └─────────────────────────────────────────────────────┘

Commands flow:
  Dashboard → POST /api/commands/{device_id}
            → MQTT publish  devices/{device_id}/commands
            → ESP32 executes command
```

---

## MQTT Topic Design

| Topic | Direction | Description |
|-------|-----------|-------------|
| `devices/{device_id}/data` | ESP32 → Server | Sensor readings (weight, irrigation_status) |
| `devices/{device_id}/commands` | Server → ESP32 | Tare / calibrate commands |
| `devices/{device_id}/status` | ESP32 → Server | Optional LWT for offline detection |

### Payload – sensor data
```json
{
  "device_id": "WS_001",
  "timestamp": "2026-03-11T10:15:22",
  "weight": 1250.45,
  "irrigation_status": "ON"
}
```

### Payload – tare command
```json
{ "command": "tare" }
```

### Payload – calibrate command
```json
{ "command": "calibrate", "reference_weight": 20 }
```

---

## PostgreSQL Schema  (`backend/migrations/001_initial.sql`)

```
devices      – device registry, settings, logging flag
events       – irrigation ON/OFF, offline, calibration, logging changes
users        – authentication + roles (admin / viewer)
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | – | Login, returns JWT |
| POST | `/api/auth/register` | Admin | Create user |
| GET | `/api/devices` | User | List devices + live status |
| POST | `/api/devices` | Admin | Register device |
| GET | `/api/devices/:id` | User | Device details |
| PATCH | `/api/devices/:id` | Admin | Update settings |
| DELETE | `/api/devices/:id` | Admin | Delete device |
| GET | `/api/data/:id` | User | Historical InfluxDB data |
| GET | `/api/data/:id/export` | User | CSV / Excel export |
| GET | `/api/events` | User | Event log (filterable) |
| POST | `/api/commands/:id` | Admin | Send MQTT command |
| GET | `/api/commands/queue` | Admin | Inspect command queue/retries |
| GET | `/api/config` | User | Read runtime ingestion/rules config |
| PATCH | `/api/config/ingestion` | Admin | Update topic/payload mapping |
| PATCH | `/api/config/rules` | Admin | Update runtime rule timings |
| GET | `/api/config/presets/list` | User | List built-in protocol presets |
| POST | `/api/config/presets/:name` | Admin | Apply protocol preset |
| GET | `/api/config/export/snapshot` | Admin | Export full deployment snapshot |
| POST | `/api/config/import/snapshot` | Admin | Import deployment snapshot |
| GET | `/api/system/status` | Admin | Operational status (DB/MQTT/queue) |
| GET | `/api/tenants` | User | List client tenants |
| POST | `/api/tenants` | Admin | Create tenant |
| PATCH | `/api/tenants/:id` | Admin | Update tenant |
| DELETE | `/api/tenants/:id` | Admin | Delete tenant |
| GET | `/api/sites` | User | List sites (optional tenant filter) |
| POST | `/api/sites` | Admin | Create site |
| PATCH | `/api/sites/:id` | Admin | Update site |
| DELETE | `/api/sites/:id` | Admin | Delete site |
| GET | `/api/rules` | User | List irrigation rules |
| POST | `/api/rules` | Admin | Create irrigation rule |
| PATCH | `/api/rules/:id` | Admin | Update irrigation rule |
| DELETE | `/api/rules/:id` | Admin | Delete irrigation rule |

### Runtime protocol configuration

Use `/api/config/ingestion` to adapt to client-specific MQTT protocols without code changes.

- `data_topic_pattern` (default: `devices/{deviceId}/data`)
- `status_topic_pattern` (default: `devices/{deviceId}/status`)
- `command_topic_template` (default: `devices/{deviceId}/commands`)
- `data_subscribe_topic`, `status_subscribe_topic` (optional explicit MQTT subscribe filters)
- `device_id_source` (`topic` or `payload`)
- `payload_format` (`json` or `number`)
- `device_id_field`, `weight_field`, `irrigation_status_field`, `timestamp_field`
- `static_irrigation_status` (used for numeric payload streams)

Use `/api/config/rules` for runtime behavior:

- `offline_timeout_ms`
- `broadcast_interval_ms`
- `default_weight_loss_threshold`

### Irrigation rules (Phase 3)

Rules are evaluated on incoming sensor readings and emit recommendation events first (dry-run mode):

- `rule_recommendation_on`
- `rule_recommendation_off`

Rule scopes supported:

- `global`
- `tenant`
- `site`
- `device`

### Control safety (Phase 4)

- Commands are queued first (`command_queue`) and sent by background worker.
- Retry behavior and ack policy are runtime-configurable in `/api/config/rules`:
  - `command_require_ack`
  - `command_ack_timeout_ms`
  - `command_retry_interval_ms`
  - `command_max_retries`
- Devices can be manually locked (`control_locked=true`) to block outgoing commands.
- `max_irrigation_on_seconds` triggers `irrigation_safety_cutoff` events when exceeded.

### Deployment portability (Phase 6)

- Export client setup (protocol config, tenants, sites, rules) via `/api/config/export/snapshot`.
- Import setup into a new deployment via `/api/config/import/snapshot`.

### Production hardening (Phase 7)

- Health endpoints:
  - `/health/live` (process liveness)
  - `/health/ready` (DB + MQTT readiness)
- Operations status endpoint: `/api/system/status`.
- Production env template: `backend/.env.production.example`.

Built-in presets:

- `modern_devices_json` (default for new ESP32 JSON devices)
- `legacy_mlm_numeric` (legacy topics like `disabled/#`, `ctl/#`, command topic `cfg/{deviceId}`)

---

## WebSocket Protocol

Connect: `ws://{host}:3001/ws`

**Authenticate immediately after connect:**
```json
{ "type": "auth", "token": "<jwt>" }
```

**Server → Client messages:**
```json
{ "type": "auth_ok" }
{ "type": "devices_batch", "timestamp": 1741694122000, "devices": [ ... ] }
{ "type": "event", "data": { "device_id": "WS_001", "event_type": "irrigation_on", ... } }
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Ingestion (existing) | Telegraf → InfluxDB v1 |
| Message Broker (existing) | Mosquitto MQTT |
| Time-series DB (existing) | InfluxDB v1 (`telegraf` database) |
| Relational DB (existing) | PostgreSQL |
| Backend API | Node.js 20, Express 4, `mqtt`, `ws`, `influx`, `pg` |
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Recharts, Zustand |
| Auth | JWT (bcryptjs + jsonwebtoken) |
| Containers | Docker + Docker Compose |

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Existing Mosquitto / InfluxDB / PostgreSQL running (or use the provided `docker-compose.yml`)

### 1. Clone & configure
```bash
cd c:/Users/User/Documents/Projects/mlm
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# Edit both files with your connection details
```

### 2. Run database migrations
```bash
# If postgres is already running:
psql -U irrigation_user -d irrigation -f backend/migrations/001_initial.sql
# Or via Docker Compose (runs automatically on first start)
```

### 3. Update Telegraf to receive ESP32 data
```bash
# Append telegraf-esp32.conf content to your existing telegraf.conf
# Then restart Telegraf
```

### 4. Start services
```bash
docker compose up -d
```

### Offline start (legacy cached images)
If the server cannot reach Docker Hub DNS/internet, use the offline compose variant that references legacy cached image names:

```bash
docker-compose -f docker-compose.offline.yml up -d
```

This starts infrastructure services only (Mosquitto, InfluxDB, Telegraf, Grafana, PostgreSQL) with old image versions.

### Offline image transfer workflow
For air-gapped or DNS-restricted servers, export the required Docker images from a machine that has internet access, move the archive to the server, then load it locally before starting Compose.

On an internet-connected machine:

```bash
docker pull postgres:16-alpine
docker pull influxdb:1.8
docker pull grafana/grafana:10.2.0
docker pull eclipse-mosquitto:2
docker pull telegraf:1.29
docker save postgres:16-alpine influxdb:1.8 grafana/grafana:10.2.0 eclipse-mosquitto:2 telegraf:1.29 > mlm_images.tar
```

Then copy `mlm_images.tar` to the target server and load it:

```bash
docker load < mlm_images.tar
docker compose up -d
```

Important: `docker compose up -d` still builds the local `backend` and `frontend` images from source. On a fully offline server, prebuild those app images on the internet-connected machine as well, then export and load them the same way:

```bash
docker compose build backend frontend
docker save mlm-backend:latest mlm-frontend:latest > mlm_app_images.tar
```

On the server:

```bash
docker load < mlm_app_images.tar
docker compose up -d --no-build
```

### 5. Create first admin user
```bash
curl -X POST http://192.168.2.10:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changethis","role":"admin"}'
# Note: first user registration is open; subsequent ones require admin JWT
```

---

## Step-by-Step Implementation Plan

### Phase 1 – Infrastructure (Day 1)
- [ ] Apply `backend/migrations/001_initial.sql` to PostgreSQL
- [ ] Append `telegraf-esp32.conf` section to Telegraf config, restart Telegraf
- [ ] Verify ESP32 data appears in InfluxDB measurement `irrigation_readings`
- [ ] Start backend: `docker compose up backend`

### Phase 2 – Backend API (Day 1-2)
- [ ] Verify MQTT service connects and logs device messages
- [ ] Test REST API with Postman / curl
- [ ] Test WebSocket connection with `wscat` or browser console

### Phase 3 – Frontend (Day 2-3)
- [ ] `npm install` in `frontend/`
- [ ] Login page functional
- [ ] Dashboard shows device cards with real-time updates
- [ ] WeightChart loads historical data from InfluxDB

### Phase 4 – Device Control (Day 3)
- [ ] Tare command sent and received by ESP32
- [ ] Calibration command flow tested
- [ ] Event log entries created correctly

### Phase 5 – Production Hardening (Day 4-5)
- [ ] Change all default passwords in `.env`
- [ ] Enable HTTPS (nginx reverse proxy with SSL)
- [ ] Set strong `JWT_SECRET`
- [ ] Monitor backend logs
- [ ] Load test with 1,000 simulated devices

---

## Performance Notes

- **Backend**: MQTT messages are processed in-memory; WebSocket broadcasts are batched every 1 second to avoid 1,000 individual pushes/second hitting clients
- **Frontend**: `@tanstack/react-virtual` renders only visible device cards (30–50 cards instead of 1,000)
- **InfluxDB queries**: Limited to 10,000 points per request; use time bucketing (`GROUP BY time(1m)`) for long ranges
- **Offline detection**: Devices are marked offline after 10 s without a message (checked every 5 s)
#   m l m 
 
 
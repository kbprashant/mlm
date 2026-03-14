import type {
  Device,
  DataPoint,
  DeviceEvent,
  LegacyMlm,
  LegacyMlmHistoryPoint,
  User,
  Tenant,
  Site,
  IrrigationRule,
  PlatformConfig,
  IngestionConfig,
  RulesConfig,
  CommandQueueItem,
} from '@/types'

// NEXT_PUBLIC_ vars are replaced at build time by Next.js — safe in both server and browser
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://192.168.2.10:3001'

function token (): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('auth_token') || ''
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(init.headers as Record<string, string> || {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  register: (username: string, password: string, role: 'admin' | 'viewer') =>
    request<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, role }),
    }),

  // ── Devices ───────────────────────────────────────────────
  getDevices: () => request<Device[]>('/api/devices'),

  getDevice: (id: string) => request<Device>(`/api/devices/${encodeURIComponent(id)}`),

  createDevice: (data: { id: string; name: string; description?: string; weight_loss_threshold?: number }) =>
    request<Device>('/api/devices', { method: 'POST', body: JSON.stringify(data) }),

  updateDevice: (id: string, data: Partial<Pick<Device, 'name' | 'description' | 'logging_enabled' | 'weight_loss_threshold'>>) =>
    request<Device>(`/api/devices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteDevice: (id: string) =>
    request<{ message: string }>(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ── Time-series data ──────────────────────────────────────
  getData: (deviceId: string, range = '1h', from?: string, to?: string) => {
    const p = new URLSearchParams({ range })
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return request<DataPoint[]>(`/api/data/${encodeURIComponent(deviceId)}?${p}`)
  },

  exportData: async (deviceId: string, range: string, format: 'csv' | 'excel', from?: string, to?: string) => {
    const p = new URLSearchParams({ range, format })
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    const url = `${API}/api/data/${encodeURIComponent(deviceId)}/export?${p}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } })
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const link = document.createElement('a')
    link.href  = URL.createObjectURL(blob)
    link.download = `${deviceId}.${format === 'csv' ? 'csv' : 'xlsx'}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  },

  // ── Events ────────────────────────────────────────────────
  getEvents: (params: { device_id?: string; type?: string; limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams()
    if (params.device_id) p.set('device_id', params.device_id)
    if (params.type)      p.set('type', params.type)
    if (params.limit)     p.set('limit', String(params.limit))
    if (params.offset)    p.set('offset', String(params.offset))
    return request<{ events: DeviceEvent[]; total: number }>(`/api/events?${p}`)
  },

  // ── Commands ──────────────────────────────────────────────
  sendCommand: (deviceId: string, payload: { command: 'tare' | 'calibrate' | 'irrigation_on' | 'irrigation_off'; reference_weight?: number }) =>
    request<{ success: boolean; queued: boolean; command_id: number; correlation_id: string; message: string }>(
      `/api/commands/${encodeURIComponent(deviceId)}`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  getCommandQueue: (params: { status?: string; limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams()
    if (params.status) p.set('status', params.status)
    if (params.limit) p.set('limit', String(params.limit))
    if (params.offset) p.set('offset', String(params.offset))
    return request<{ commands: CommandQueueItem[]; limit: number; offset: number }>(`/api/commands/queue?${p}`)
  },

  // ── Tenants / Sites ───────────────────────────────────────
  getTenants: () => request<Tenant[]>('/api/tenants'),

  createTenant: (data: { code: string; name: string }) =>
    request<Tenant>('/api/tenants', { method: 'POST', body: JSON.stringify(data) }),

  updateTenant: (id: number, data: { name: string }) =>
    request<Tenant>(`/api/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteTenant: (id: number) =>
    request<{ message: string; id: number }>(`/api/tenants/${id}`, { method: 'DELETE' }),

  getSites: (tenantId?: number) => {
    const q = tenantId ? `?tenant_id=${tenantId}` : ''
    return request<Site[]>(`/api/sites${q}`)
  },

  createSite: (data: { tenant_id: number; code: string; name: string; timezone?: string }) =>
    request<Site>('/api/sites', { method: 'POST', body: JSON.stringify(data) }),

  updateSite: (id: number, data: { name?: string; timezone?: string }) =>
    request<Site>(`/api/sites/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteSite: (id: number) =>
    request<{ message: string; id: number }>(`/api/sites/${id}`, { method: 'DELETE' }),

  // ── Rules ─────────────────────────────────────────────────
  getRules: (scopeType?: 'global' | 'tenant' | 'site' | 'device') => {
    const q = scopeType ? `?scope_type=${scopeType}` : ''
    return request<IrrigationRule[]>(`/api/rules${q}`)
  },

  createRule: (data: {
    name: string
    enabled?: boolean
    dry_run?: boolean
    priority?: number
    scope_type: 'global' | 'tenant' | 'site' | 'device'
    tenant_id?: number | null
    site_id?: number | null
    device_id?: string | null
    trigger_below_weight: number
    stop_above_weight?: number | null
    hysteresis?: number
  }) => request<IrrigationRule>('/api/rules', { method: 'POST', body: JSON.stringify(data) }),

  updateRule: (id: number, data: Partial<Pick<IrrigationRule, 'name' | 'enabled' | 'dry_run' | 'priority' | 'trigger_below_weight' | 'stop_above_weight' | 'hysteresis'>>) =>
    request<IrrigationRule>(`/api/rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteRule: (id: number) =>
    request<{ message: string; id: number }>(`/api/rules/${id}`, { method: 'DELETE' }),

  // ── Runtime config ────────────────────────────────────────
  getConfig: () => request<PlatformConfig>('/api/config'),

  updateIngestionConfig: (data: Partial<IngestionConfig>) =>
    request<IngestionConfig>('/api/config/ingestion', { method: 'PATCH', body: JSON.stringify(data) }),

  updateRulesConfig: (data: Partial<RulesConfig>) =>
    request<RulesConfig>('/api/config/rules', { method: 'PATCH', body: JSON.stringify(data) }),

  listConfigPresets: () => request<{ presets: string[] }>('/api/config/presets/list'),

  applyConfigPreset: (name: string) =>
    request<{ name: string; ingestion: IngestionConfig; rules: RulesConfig }>(`/api/config/presets/${encodeURIComponent(name)}`, {
      method: 'POST',
    }),

  exportSnapshot: () => request<{
    version: number
    exported_at: string
    config: PlatformConfig
    tenants: Array<{ code: string; name: string }>
    sites: Array<{ code: string; name: string; timezone: string; tenant_code: string }>
    rules: Array<Record<string, unknown>>
  }>('/api/config/export/snapshot'),

  importSnapshot: (snapshot: {
    config?: Partial<PlatformConfig>
    tenants?: Array<{ code: string; name: string }>
    sites?: Array<{ code: string; name: string; timezone?: string; tenant_code: string }>
    rules?: Array<Record<string, unknown>>
    replace_rules?: boolean
  }) => request<{ success: boolean }>('/api/config/import/snapshot', {
    method: 'POST',
    body: JSON.stringify(snapshot),
  }),

  // ── Legacy MLM schema ─────────────────────────────────────
  getLegacyMlms: (site?: string) => {
    const query = site ? `?site=${encodeURIComponent(site)}` : ''
    return request<{ site: string | null; mlms: LegacyMlm[] }>(`/api/legacy/mlms${query}`)
  },

  getLegacyMlm: (id: string) =>
    request<LegacyMlm>(`/api/legacy/mlms/${encodeURIComponent(id)}`),

  getLegacyMlmHistory: (id: string, range = '24h', from?: string, to?: string) => {
    const params = new URLSearchParams({ range })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    return request<LegacyMlmHistoryPoint[]>(`/api/legacy/mlms/${encodeURIComponent(id)}/history?${params}`)
  },
}

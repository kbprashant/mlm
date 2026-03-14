'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { CommandQueueItem, IrrigationRule, PlatformConfig, Site, Tenant } from '@/types'

export default function AdminPage () {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [rules, setRules] = useState<IrrigationRule[]>([])
  const [config, setConfig] = useState<PlatformConfig | null>(null)
  const [presets, setPresets] = useState<string[]>([])
  const [queue, setQueue] = useState<CommandQueueItem[]>([])
  const [selectedPreset, setSelectedPreset] = useState('modern_devices_json')
  const [replaceRulesOnImport, setReplaceRulesOnImport] = useState(false)
  const [importJson, setImportJson] = useState('')

  const [tenantCode, setTenantCode] = useState('')
  const [tenantName, setTenantName] = useState('')

  const [siteTenantId, setSiteTenantId] = useState<number | ''>('')
  const [siteCode, setSiteCode] = useState('')
  const [siteName, setSiteName] = useState('')
  const [siteTimezone, setSiteTimezone] = useState('UTC')

  const [ruleName, setRuleName] = useState('Default dry-run rule')
  const [ruleScope, setRuleScope] = useState<'global' | 'tenant' | 'site' | 'device'>('global')
  const [ruleTenantId, setRuleTenantId] = useState<number | ''>('')
  const [ruleSiteId, setRuleSiteId] = useState<number | ''>('')
  const [ruleDeviceId, setRuleDeviceId] = useState('')
  const [triggerBelowWeight, setTriggerBelowWeight] = useState<number>(1000)
  const [stopAboveWeight, setStopAboveWeight] = useState<number>(1050)
  const [hysteresis, setHysteresis] = useState<number>(25)
  const [dryRun, setDryRun] = useState(true)

  async function reloadAll () {
    const [tenantRows, siteRows, ruleRows, cfg, presetRows, queueRows] = await Promise.all([
      api.getTenants(),
      api.getSites(),
      api.getRules(),
      api.getConfig(),
      api.listConfigPresets(),
      api.getCommandQueue({ limit: 50 }),
    ])
    setTenants(tenantRows)
    setSites(siteRows)
    setRules(ruleRows)
    setConfig(cfg)
    setPresets(presetRows.presets)
    setQueue(queueRows.commands)
    if (presetRows.presets.length > 0 && !presetRows.presets.includes(selectedPreset)) {
      setSelectedPreset(presetRows.presets[0])
    }
  }

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('auth_user') : null
    if (raw) {
      try {
        const user = JSON.parse(raw) as { role?: string }
        setIsAdmin(user.role === 'admin')
      } catch {
        setIsAdmin(false)
      }
    }

    reloadAll()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load admin data'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sitesForSelectedTenant = useMemo(() => {
    if (ruleTenantId === '') return []
    return sites.filter((s) => s.tenant_id === ruleTenantId)
  }, [sites, ruleTenantId])

  async function onCreateTenant (e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.createTenant({ code: tenantCode.trim().toLowerCase(), name: tenantName.trim() })
      setTenantCode('')
      setTenantName('')
      await reloadAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create tenant')
    }
  }

  async function onCreateSite (e: React.FormEvent) {
    e.preventDefault()
    if (siteTenantId === '') return
    setError(null)
    try {
      await api.createSite({
        tenant_id: siteTenantId,
        code: siteCode.trim().toLowerCase(),
        name: siteName.trim(),
        timezone: siteTimezone.trim() || 'UTC',
      })
      setSiteCode('')
      setSiteName('')
      setSiteTimezone('UTC')
      await reloadAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create site')
    }
  }

  async function onCreateRule (e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.createRule({
        name: ruleName.trim(),
        scope_type: ruleScope,
        tenant_id: ruleScope === 'tenant' || ruleScope === 'site' ? (ruleTenantId === '' ? null : ruleTenantId) : null,
        site_id: ruleScope === 'site' ? (ruleSiteId === '' ? null : ruleSiteId) : null,
        device_id: ruleScope === 'device' ? ruleDeviceId.trim() || null : null,
        trigger_below_weight: triggerBelowWeight,
        stop_above_weight: stopAboveWeight,
        hysteresis,
        dry_run: dryRun,
      })
      await reloadAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create rule')
    }
  }

  async function onApplyPreset () {
    if (!selectedPreset) return
    setError(null)
    try {
      await api.applyConfigPreset(selectedPreset)
      await reloadAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply preset')
    }
  }

  async function onToggleRule (rule: IrrigationRule) {
    try {
      await api.updateRule(rule.id, { enabled: !rule.enabled })
      await reloadAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update rule')
    }
  }

  async function onExportSnapshot () {
    setError(null)
    try {
      const snapshot = await api.exportSnapshot()
      const text = JSON.stringify(snapshot, null, 2)
      setImportJson(text)
      if (typeof window !== 'undefined') {
        const blob = new Blob([text], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `mlm-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export snapshot')
    }
  }

  async function onImportSnapshot () {
    setError(null)
    try {
      const parsed = JSON.parse(importJson) as {
        config?: Partial<PlatformConfig>
        tenants?: Array<{ code: string; name: string }>
        sites?: Array<{ code: string; name: string; timezone?: string; tenant_code: string }>
        rules?: Array<Record<string, unknown>>
      }
      await api.importSnapshot({ ...parsed, replace_rules: replaceRulesOnImport })
      await reloadAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import snapshot')
    }
  }

  if (loading) return <p className="text-gray-400">Loading admin panel…</p>
  if (!isAdmin) return <p className="text-red-400">Admin access required.</p>

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Admin</h1>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <section className="rounded-xl border border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">Protocol Preset</h2>
        <div className="flex items-center gap-3">
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
          >
            {presets.map((preset) => (
              <option key={preset} value={preset}>{preset}</option>
            ))}
          </select>
          <button onClick={onApplyPreset} className="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded text-sm">
            Apply
          </button>
        </div>
        {config && (
          <p className="text-xs text-gray-400">
            Active topic map: {config.ingestion.data_subscribe_topic} | Command: {config.ingestion.command_topic_template}
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={onCreateTenant} className="rounded-xl border border-gray-800 p-4 space-y-3">
          <h2 className="font-semibold">Create Tenant</h2>
          <input value={tenantCode} onChange={(e) => setTenantCode(e.target.value)} placeholder="tenant code" className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm" />
          <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="tenant name" className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm" />
          <button className="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded text-sm">Add Tenant</button>
        </form>

        <form onSubmit={onCreateSite} className="rounded-xl border border-gray-800 p-4 space-y-3">
          <h2 className="font-semibold">Create Site</h2>
          <select value={siteTenantId} onChange={(e) => setSiteTenantId(e.target.value ? Number(e.target.value) : '')} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm">
            <option value="">Select tenant</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={siteCode} onChange={(e) => setSiteCode(e.target.value)} placeholder="site code" className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm" />
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="site name" className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm" />
          <input value={siteTimezone} onChange={(e) => setSiteTimezone(e.target.value)} placeholder="timezone" className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm" />
          <button className="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded text-sm">Add Site</button>
        </form>
      </section>

      <section className="rounded-xl border border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">Create Rule (Dry-Run)</h2>
        <form onSubmit={onCreateRule} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="rule name" className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm" />
          <select value={ruleScope} onChange={(e) => setRuleScope(e.target.value as 'global' | 'tenant' | 'site' | 'device')} className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm">
            <option value="global">global</option>
            <option value="tenant">tenant</option>
            <option value="site">site</option>
            <option value="device">device</option>
          </select>

          {(ruleScope === 'tenant' || ruleScope === 'site') && (
            <select value={ruleTenantId} onChange={(e) => setRuleTenantId(e.target.value ? Number(e.target.value) : '')} className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm">
              <option value="">Select tenant</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}

          {ruleScope === 'site' && (
            <select value={ruleSiteId} onChange={(e) => setRuleSiteId(e.target.value ? Number(e.target.value) : '')} className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm">
              <option value="">Select site</option>
              {sitesForSelectedTenant.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          {ruleScope === 'device' && (
            <input value={ruleDeviceId} onChange={(e) => setRuleDeviceId(e.target.value)} placeholder="device id" className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm" />
          )}

          <input type="number" value={triggerBelowWeight} onChange={(e) => setTriggerBelowWeight(Number(e.target.value))} placeholder="trigger below weight" className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm" />
          <input type="number" value={stopAboveWeight} onChange={(e) => setStopAboveWeight(Number(e.target.value))} placeholder="stop above weight" className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm" />
          <input type="number" value={hysteresis} onChange={(e) => setHysteresis(Number(e.target.value))} placeholder="hysteresis" className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm" />

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry-run mode
          </label>

          <button className="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded text-sm w-fit">Add Rule</button>
        </form>
      </section>

      <section className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 font-semibold">Current Rules</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 text-left">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Trigger</th>
              <th className="px-4 py-3">Stop</th>
              <th className="px-4 py-3">Dry-run</th>
              <th className="px-4 py-3">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-t border-gray-800">
                <td className="px-4 py-3">{rule.name}</td>
                <td className="px-4 py-3">{rule.scope_type}</td>
                <td className="px-4 py-3 font-mono">{rule.trigger_below_weight}</td>
                <td className="px-4 py-3 font-mono">{rule.stop_above_weight ?? '—'}</td>
                <td className="px-4 py-3">{rule.dry_run ? 'YES' : 'NO'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => onToggleRule(rule)} className={`px-2 py-1 rounded text-xs ${rule.enabled ? 'bg-green-700' : 'bg-gray-700'}`}>
                    {rule.enabled ? 'ON' : 'OFF'}
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No rules configured.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">Command Queue</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 pr-3">ID</th>
                <th className="text-left py-2 pr-3">Device</th>
                <th className="text-left py-2 pr-3">Command</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-left py-2 pr-3">Attempts</th>
                <th className="text-left py-2 pr-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr key={item.id} className="border-b border-gray-900">
                  <td className="py-2 pr-3 font-mono">{item.id}</td>
                  <td className="py-2 pr-3">{item.device_id}</td>
                  <td className="py-2 pr-3">{item.command_type}</td>
                  <td className="py-2 pr-3">{item.status}</td>
                  <td className="py-2 pr-3">{item.attempts}/{item.max_attempts}</td>
                  <td className="py-2 pr-3">{new Date(item.updated_at).toLocaleString()}</td>
                </tr>
              ))}
              {queue.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-500">No queued commands.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">Backup / Restore</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={onExportSnapshot} className="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded text-sm">
            Export Snapshot
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={replaceRulesOnImport}
              onChange={(e) => setReplaceRulesOnImport(e.target.checked)}
            />
            Replace all rules on import
          </label>
          <button onClick={onImportSnapshot} className="bg-emerald-700 hover:bg-emerald-600 px-3 py-2 rounded text-sm">
            Import Snapshot
          </button>
        </div>
        <textarea
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          placeholder="Paste exported JSON snapshot here"
          className="w-full min-h-48 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs font-mono"
        />
      </section>
    </div>
  )
}

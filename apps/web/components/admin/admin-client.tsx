'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  SlidersHorizontal,
  Users,
  ShieldAlert,
  BellRing,
  Pencil,
  Save,
  X,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { shortAddress } from '@/lib/format'

type Tab = 'limits' | 'members' | 'circuit' | 'notifications'

interface Limits {
  max_repayment_pct: number
  max_gas_price_gwei: number
  max_consecutive_failures: number
  allowed_contracts?: string[]
  updated_at?: string
}

interface Member {
  id?: string
  wallet_address: string
  role: string
  created_at?: string
}

interface Circuit {
  is_tripped: boolean
  failure_count: number
  last_failure_reason: string | null
  tripped_at?: string | null
}

function avatarColor(wallet: string) {
  const seed = wallet.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const palette = ['#0068f9', '#6736eb', '#046645', '#b45309', '#b42318']
  return palette[seed % palette.length]
}

export function AdminClient() {
  const [tab, setTab] = useState<Tab>('limits')
  const [limits, setLimits] = useState<Limits | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [circuit, setCircuit] = useState<Circuit | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // form state
  const [repay, setRepay] = useState('30')
  const [gas, setGas] = useState('50')
  const [failures, setFailures] = useState('3')
  const [contracts, setContracts] = useState<string[]>([])
  const [contractInput, setContractInput] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [newWallet, setNewWallet] = useState('')
  const [newRole, setNewRole] = useState('operator')
  const [editingWallet, setEditingWallet] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [l, m, c] = await Promise.all([
        fetch('/api/admin/hard-limits').then((r) => r.json()),
        fetch('/api/admin/members').then((r) => r.json()),
        fetch('/api/admin/circuit').then((r) => r.json()),
      ])
      if (l.limits) {
        setLimits(l.limits)
        setRepay(String(l.limits.max_repayment_pct))
        setGas(String(l.limits.max_gas_price_gwei))
        setFailures(String(l.limits.max_consecutive_failures))
        setContracts(l.limits.allowed_contracts ?? [])
      }
      setMembers(m.members ?? [])
      setCircuit(c.circuit)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveLimits() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/hard-limits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_repayment_pct: Number(repay),
          max_gas_price_gwei: Number(gas),
          max_consecutive_failures: Number(failures),
          allowed_contracts: contracts,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setLimits(data.limits)
      setMessage('Hard limits saved — agent will use them on the next cycle.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function addMember() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: newWallet, role: newRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Add failed')
      setNewWallet('')
      setAddingMember(false)
      setMessage(`Member ${shortAddress(newWallet)} set as ${newRole}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function setRole(wallet: string, role: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      setEditingWallet(null)
      setMessage(`Role updated for ${shortAddress(wallet)}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(wallet: string) {
    if (!confirm(`Revoke ${wallet}?`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/members?wallet=${encodeURIComponent(wallet)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Revoke failed')
      setMessage(`Member ${shortAddress(wallet)} revoked.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function circuitAction(action: 'reset' | 'trip') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/circuit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Circuit update failed')
      setCircuit(data.circuit)
      setMessage(action === 'reset' ? 'Circuit breaker reset.' : 'Circuit breaker forced trip.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function addContract() {
    const c = contractInput.trim().toLowerCase()
    if (!c) return
    setContracts((prev) => (prev.includes(c) ? prev : [...prev, c]))
    setContractInput('')
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'limits', label: 'Hard Limits', icon: SlidersHorizontal },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'circuit', label: 'Circuit', icon: ShieldAlert },
    { id: 'notifications', label: 'Alerts', icon: BellRing },
  ]

  const scrollTo = useMemo(
    () => (id: string) => {
      document
        .getElementById(`admin-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Admin Settings</h1>
          <p className="mt-1 text-sm text-slate">
            Hard limits, members, circuit breaker, and alerts.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Tab rail */}
      <div className="flex flex-wrap gap-1 border-b border-hairline">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                scrollTo(t.id)
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-b-2 border-cobalt text-cobalt'
                  : 'text-slate hover:text-ink'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {message ? (
        <div className="rounded-card border border-forest/20 bg-forest/5 px-4 py-3 text-sm text-forest">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-card border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div id="admin-grid" className="grid gap-6 lg:grid-cols-2">
        {/* Hard limits */}
        <Card id="admin-limits" className="scroll-mt-20 border-0 shadow-subtle">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-cobalt" />
              Hard Limits
            </CardTitle>
            <CardDescription>
              Cannot be overridden by Gemini or Operators. Applies on the next agent cycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Max repayment %" suffix="%">
              <Input type="number" value={repay} onChange={(e) => setRepay(e.target.value)} />
            </Field>
            <Field label="Max gas price" suffix="Gwei">
              <Input type="number" value={gas} onChange={(e) => setGas(e.target.value)} />
            </Field>
            <Field label="Max consecutive failures" suffix="times">
              <Input
                type="number"
                value={failures}
                onChange={(e) => setFailures(e.target.value)}
              />
            </Field>
            <Field label="Allowed contracts">
              <div className="flex gap-2">
                <Input
                  placeholder="0x…"
                  value={contractInput}
                  onChange={(e) => setContractInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addContract()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addContract} aria-label="Add contract">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {contracts.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {contracts.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1.5 rounded-pill bg-ivory px-3 py-1 font-mono text-xs text-ink"
                    >
                      {shortAddress(c)}
                      <button
                        type="button"
                        aria-label={`Remove ${c}`}
                        onClick={() => setContracts((prev) => prev.filter((x) => x !== c))}
                        className="text-slate hover:text-danger"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-steel">No allowed contracts added.</p>
              )}
            </Field>
            <Button type="button" disabled={busy} onClick={() => void saveLimits()}>
              {busy ? <Loader2 className="animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
            {limits?.updated_at ? (
              <p className="text-xs text-slate">
                Last updated {new Date(limits.updated_at).toLocaleString()}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Members */}
        <Card id="admin-members" className="scroll-mt-20 border-0 shadow-subtle lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-cobalt" />
                Members
              </CardTitle>
              <CardDescription>
                Privileged roles are never auto-assigned on SIWE login.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAddingMember((s) => !s)}
            >
              {addingMember ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {addingMember ? 'Cancel' : 'Add Member'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {addingMember ? (
              <div className="rounded-card border border-hairline bg-ivory p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[240px] flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate">Wallet</label>
                    <Input
                      placeholder="0x…"
                      value={newWallet}
                      onChange={(e) => setNewWallet(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate">Role</label>
                    <select
                      className="h-11 rounded-pill border border-hairline bg-white px-4 text-sm"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                    >
                      <option value="operator">Operator</option>
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                  <Button type="button" disabled={busy || !newWallet} onClick={() => void addMember()}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b border-hairline text-xs uppercase tracking-wide text-slate">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Wallet</th>
                    <th className="py-2 pr-3 font-medium">Role</th>
                    <th className="py-2 pr-3 font-medium">Joined</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.wallet_address} className="border-b border-hairline/80 last:border-0">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                            style={{ backgroundColor: avatarColor(m.wallet_address) }}
                          >
                            {m.wallet_address.slice(2, 4).toUpperCase()}
                          </span>
                          <span className="font-mono text-xs text-ink">{m.wallet_address}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        {editingWallet === m.wallet_address ? (
                          <select
                            className="h-9 rounded-pill border border-hairline bg-white px-3 text-sm capitalize"
                            defaultValue={m.role}
                            disabled={busy}
                            onChange={(e) => void setRole(m.wallet_address, e.target.value)}
                          >
                            <option value="admin">admin</option>
                            <option value="operator">operator</option>
                            <option value="viewer">viewer</option>
                          </select>
                        ) : (
                          <Badge
                            tone={
                              m.role === 'admin'
                                ? 'warn'
                                : m.role === 'operator'
                                  ? 'success'
                                  : 'neutral'
                            }
                            className="capitalize"
                          >
                            {m.role}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-slate">
                        {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {editingWallet === m.wallet_address ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingWallet(null)}
                            >
                              Cancel
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => setEditingWallet(m.wallet_address)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Change role
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void revoke(m.wallet_address)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-danger" />
                            Revoke
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-sm text-slate">
                        No members yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Circuit breaker */}
        <Card id="admin-circuit" className="scroll-mt-20 border-0 shadow-subtle">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-cobalt" />
              Circuit Breaker
            </CardTitle>
            <CardDescription>
              After repeated execution failures the agent stops until reset.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge tone={circuit?.is_tripped ? 'danger' : 'success'}>
                {circuit?.is_tripped ? (
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Tripped
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </span>
                )}
              </Badge>
              <span className="text-sm text-slate">
                Failure count: <span className="font-semibold tabular-nums text-ink">{circuit?.failure_count ?? 0}</span>
              </span>
              {circuit?.tripped_at ? (
                <span className="text-xs text-steel">
                  {new Date(circuit.tripped_at).toLocaleString()}
                </span>
              ) : null}
            </div>
            {circuit?.last_failure_reason ? (
              <p className="text-sm text-slate">Last reason: {circuit.last_failure_reason}</p>
            ) : (
              <p className="text-sm text-slate">No recent failures recorded.</p>
            )}
            <div className="rounded-card border border-danger/20 bg-danger/5 px-4 py-3 text-xs text-slate">
              Tripping stops all scheduled and manual execution until an Admin resets it here.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void circuitAction('reset')}>
                {circuit?.is_tripped ? <RefreshCw className="h-4 w-4" /> : null}
                Reset circuit breaker
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  if (!confirm('Force-trip the circuit breaker for testing?')) return
                  await circuitAction('trip')
                }}
              >
                Force trip
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card id="admin-notifications" className="scroll-mt-20 border-0 shadow-subtle">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-cobalt" />
              Notifications
            </CardTitle>
            <CardDescription>
              Discord alerts are configured on the agent via{' '}
              <code className="text-ink">DISCORD_WEBHOOK_URL</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate">Discord webhook URL</span>
              <Input placeholder="https://discord.com/api/webhooks/…" disabled />
            </label>
            <p className="rounded-card border border-hairline bg-ivory px-4 py-3 text-xs">
              Set the webhook in <code className="text-ink">apps/agent/.env</code> so circuit-breaker
              and liquidation alerts can post to your channel. Storing per-org webhooks in Supabase
              is deferred to a later phase.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Field({
  label,
  suffix,
  children,
}: {
  label: string
  suffix?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-slate">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex-1">{children}</div>
        {suffix ? (
          <span className="text-sm font-medium text-slate">{suffix}</span>
        ) : null}
      </div>
    </label>
  )
}
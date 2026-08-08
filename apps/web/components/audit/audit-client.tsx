'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LayoutList,
  CalendarClock,
  Hand,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { explorerTxUrl, formatHf, shortAddress } from '@/lib/format'
import { HF_SOFT_REBALANCE, HF_SAFE_EXIT } from '@defi-sentinel/shared'

interface AuditRow {
  id: string
  execution_id: string
  timestamp: string
  trigger_type: string
  actor_wallet: string | null
  position_state: {
    health_factor?: number
    collateral_usd?: number
    debt_usd?: number
    target_wallet?: string
    network?: string
  }
  llm_reasoning?: {
    model?: string
    thought_summary?: string
    proposed_tool_call?: string
  } | null
  guardrail_validation: {
    status?: string
    rules_checked?: string[]
    violations?: string[]
  }
  execution_details?: {
    execution_status?: string
    tx_hash?: string
    simulation_status?: string
    keeperhub_workflow_id?: string
    retry_attempts?: number
  } | null
}

interface AuditResponse {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  counts: { all: number; scheduled: number; manual: number; success: number; failed: number }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString()
}

function triggerLabel(t: string) {
  return t === 'SCHEDULED_CRON' ? 'Scheduled' : 'Manual'
}

function actionLabel(row: AuditRow): string {
  const tool = row.llm_reasoning?.proposed_tool_call
  if (tool) {
    if (/soft|rebalance/i.test(tool)) return 'Soft Rebalance'
    if (/safe|exit/i.test(tool)) return 'Safe Exit'
    return tool.replace(/_/g, ' ')
  }
  if (row.trigger_type === 'SCHEDULED_CRON') return 'Health Check'
  return 'Manual Action'
}

function hfZoneKb(hf: number | undefined) {
  if (hf == null || !Number.isFinite(hf)) return 'text-steel'
  if (hf <= HF_SAFE_EXIT) return 'text-danger'
  if (hf <= HF_SOFT_REBALANCE) return 'text-cobalt'
  return 'text-forest'
}

export function AuditClient() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const EMPTY_COUNTS = { all: 0, scheduled: 0, manual: 0, success: 0, failed: 0 }
  const [counts, setCounts] = useState<AuditResponse['counts']>(EMPTY_COUNTS)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [trigger, setTrigger] = useState('')
  const [status, setStatus] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showDates, setShowDates] = useState(false)

  const [selected, setSelected] = useState<AuditRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (overridePage?: number) => {
      setLoading(true)
      try {
        const q = new URLSearchParams()
        if (trigger) q.set('trigger', trigger)
        if (status) q.set('status', status)
        if (from) q.set('from', from)
        if (to) q.set('to', to)
        q.set('page', String(overridePage ?? page))
        q.set('pageSize', String(pageSize))
        const res = await fetch(`/api/audit?${q}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`Audit ${res.status}`)
        const data = (await res.json()) as AuditResponse
        let list: AuditRow[] = data.rows ?? []
        if (action) {
          const term = action.toLowerCase()
          list = list.filter(
            (r) =>
              actionLabel(r).toLowerCase().includes(term) ||
              (r.guardrail_validation?.status ?? '').toLowerCase() === term,
          )
        }
        setRows(list)
        setTotal(data.total ?? list.length)
        setCounts(data.counts ?? EMPTY_COUNTS)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trigger, status, from, to, action, page, pageSize],
  )

  useEffect(() => {
    void load()
  }, [load])

  function resetFilters() {
    setTrigger('')
    setStatus('')
    setAction('')
    setFrom('')
    setTo('')
    setShowDates(false)
    setPage(1)
  }

  // Close drawer on Escape.
  useEffect(() => {
    if (!selected) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  const summaryCards = [
    { label: 'All Events', value: counts.all, icon: LayoutList, tone: 'text-ink' },
    { label: 'Scheduled', value: counts.scheduled, icon: CalendarClock, tone: 'text-cobalt' },
    { label: 'Manual', value: counts.manual, icon: Hand, tone: 'text-violet' },
    { label: 'Successful', value: counts.success, icon: CheckCircle2, tone: 'text-forest' },
    { label: 'Failed', value: counts.failed, icon: AlertCircle, tone: 'text-danger' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Audit Trail</h1>
          <p className="mt-1 text-sm text-slate">
            Append-only history of every agent cycle. Viewers cannot access this page.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.label} className="border-0 shadow-subtle">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cobalt/10">
                  <Icon className="h-5 w-5 text-cobalt" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium uppercase tracking-wide text-slate">
                    {card.label}
                  </p>
                  <p className={`text-xl font-semibold tabular-nums ${card.tone}`}>
                    {loading ? '…' : card.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-slate" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field label="Trigger type">
            <select
              className="h-10 min-w-[160px] rounded-pill border border-hairline bg-white px-4 text-sm text-ink"
              value={trigger}
              onChange={(e) => {
                setTrigger(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All triggers</option>
              <option value="SCHEDULED_CRON">Scheduled</option>
              <option value="MANUAL_OPERATOR">Manual</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              className="h-10 min-w-[160px] rounded-pill border border-hairline bg-white px-4 text-sm text-ink"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All statuses</option>
              <option value="PASSED">PASSED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="PENDING">PENDING</option>
              <option value="REVERTED">REVERTED</option>
            </select>
          </Field>
          <Field label="Action">
            <select
              className="h-10 min-w-[160px] rounded-pill border border-hairline bg-white px-4 text-sm text-ink"
              value={action}
              onChange={(e) => {
                setAction(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All actions</option>
              <option value="Soft Rebalance">Soft Rebalance</option>
              <option value="Safe Exit">Safe Exit</option>
              <option value="Health Check">Health Check</option>
              <option value="Manual Action">Manual Action</option>
            </select>
          </Field>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowDates((s) => !s)}
          >
            Date range
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDates ? 'rotate-180' : ''}`} />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
            Reset
          </Button>
          {showDates ? (
            <div className="flex w-full flex-wrap items-end gap-3 border-t border-hairline pt-3">
              <Field label="From">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value)
                    setPage(1)
                  }}
                  className="h-10 rounded-pill border border-hairline bg-white px-4 text-sm text-ink"
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value)
                    setPage(1)
                  }}
                  className="h-10 rounded-pill border border-hairline bg-white px-4 text-sm text-ink"
                />
              </Field>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-card border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {/* Table */}
      <Card className="border-0 shadow-subtle">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Events</CardTitle>
            <CardDescription>
              {loading ? 'Loading…' : `${rangeStart}–${rangeEnd} of ${total}`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 && !loading ? (
            <p className="py-8 text-center text-sm text-slate">No matching audit rows.</p>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-hairline text-xs uppercase tracking-wide text-slate">
                <tr>
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Trigger</th>
                  <th className="py-2 pr-3 font-medium">HF</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 pr-3 font-medium">Tx Hash</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const gStatus = row.guardrail_validation?.status ?? '—'
                  const eStatus = row.execution_details?.execution_status ?? '—'
                  const tx = row.execution_details?.tx_hash
                  const network = row.position_state?.network ?? 'Base Sepolia'
                  const isSelected = selected?.id === row.id
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(row)}
                      className={`cursor-pointer border-b border-hairline/80 last:border-0 ${
                        isSelected ? 'bg-cobalt/5' : 'hover:bg-ivory/80'
                      }`}
                    >
                      <td className="py-3 pr-3 text-ink">{formatTime(row.timestamp)}</td>
                      <td className="py-3 pr-3 text-slate">{triggerLabel(row.trigger_type)}</td>
                      <td className="py-3 pr-3 tabular-nums text-ink">
                        <span className={hfZoneKb(row.position_state?.health_factor)}>
                          {formatHf(row.position_state?.health_factor)}
                        </span>
                      </td>
                      <td className="py-3 pr-3 font-medium text-ink">{actionLabel(row)}</td>
                      <td className="py-3 pr-3">
                        {tx ? (
                          <a
                            href={explorerTxUrl(network, tx)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-cobalt hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {shortAddress(tx)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-steel">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge
                          tone={
                            eStatus === 'CONFIRMED' || gStatus === 'PASSED'
                              ? 'success'
                              : eStatus === 'REJECTED' || eStatus === 'REVERTED' || gStatus === 'REJECTED'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {eStatus !== '—' ? eStatus : gStatus}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-6 py-3">
          <p className="text-xs text-slate">
            {action ? 'Action filter applies to the current page.' : 'Page'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1))
                void load(page - 1)
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <span className="text-xs tabular-nums text-slate">
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => {
                setPage((p) => Math.min(totalPages, p + 1))
                void load(page + 1)
              }}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {selected ? (
        <AuditDrawer row={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-slate">{label}</span>
      {children}
    </label>
  )
}

function AuditDrawer({ row, onClose }: { row: AuditRow; onClose: () => void }) {
  const gStatus = row.guardrail_validation?.status ?? '—'
  const eStatus = row.execution_details?.execution_status ?? '—'
  const tx = row.execution_details?.tx_hash
  const network = row.position_state?.network ?? 'Base Sepolia'
  const failed =
    eStatus === 'REJECTED' || eStatus === 'REVERTED' || gStatus === 'REJECTED'

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Audit details">
      <button
        type="button"
        aria-label="Close audit details"
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-canvas shadow-soft">
        <header className="flex items-center justify-between border-b border-hairline bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <Badge tone={failed ? 'danger' : 'success'}>
              {eStatus !== '—' ? eStatus : gStatus}
            </Badge>
            <span className="text-sm font-medium text-slate">
              {triggerLabel(row.trigger_type)} · Audit
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            title="Close"
            autoFocus
          >
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Timestamp" value={formatTime(row.timestamp)} />
            <Info label="Execution ID" value={shortAddress(row.execution_id)} mono />
            <Info label="Trigger" value={triggerLabel(row.trigger_type)} />
            <Info
              label="Actor"
              value={row.actor_wallet ? shortAddress(row.actor_wallet) : 'Scheduled'}
              mono
            />
            <Info
              label="Health Factor"
              value={formatHf(row.position_state?.health_factor)}
              mono
            />
            <Info label="Action" value={actionLabel(row)} />
          </div>

          {tx ? (
            <a
              href={explorerTxUrl(network, tx)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-pill bg-cobalt/10 px-4 py-2 text-sm font-medium text-cobalt hover:bg-cobalt/15"
            >
              View transaction
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}

          <Section title="Agent Thought" defaultOpen={Boolean(row.llm_reasoning?.thought_summary)}>
            {row.llm_reasoning ? (
              <div className="space-y-1 text-sm">
                <p className="text-slate">Model: {row.llm_reasoning.model ?? '—'}</p>
                <p className="text-ink">{row.llm_reasoning.thought_summary ?? '—'}</p>
                {row.llm_reasoning.proposed_tool_call ? (
                  <p className="font-mono text-xs text-slate">
                    {row.llm_reasoning.proposed_tool_call}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate">None</p>
            )}
          </Section>

          <Section title="Guardrail Validation">
            <div className="space-y-2 text-sm">
              <p className="text-slate">
                Status: <span className="font-medium text-ink">{gStatus}</span>
              </p>
              {row.guardrail_validation?.rules_checked?.length ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate">
                    Rules checked
                  </p>
                  {row.guardrail_validation.rules_checked.map((r) => (
                    <p key={r} className="font-mono text-xs text-slate">
                      ✓ {r}
                    </p>
                  ))}
                </div>
              ) : null}
              {row.guardrail_validation?.violations?.length ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-danger">
                    Violations
                  </p>
                  {row.guardrail_validation.violations.map((v) => (
                    <p key={v} className="font-mono text-xs text-danger">
                      ✕ {v}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="Execution Details">
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-ink">
              {JSON.stringify(row.execution_details ?? {}, null, 2)}
            </pre>
          </Section>

          <Section title="Full Position JSON">
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-ink">
              {JSON.stringify(row.position_state, null, 2)}
            </pre>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-card border border-hairline bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate">{label}</p>
      <p className={`mt-1 truncate text-sm text-ink ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  )
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-card border border-hairline bg-white px-4 py-3"
    >
      <summary className="cursor-pointer text-sm font-semibold text-ink">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}
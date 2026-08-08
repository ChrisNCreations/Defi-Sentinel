'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, RefreshCw, ArrowUpRight } from 'lucide-react'
import { HF_SAFE_EXIT, HF_SOFT_REBALANCE } from '@defi-sentinel/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HfGauge } from '@/components/dashboard/hf-gauge'
import { MetricCards } from '@/components/dashboard/metric-cards'
import { PortfolioChart } from '@/components/dashboard/portfolio-chart'
import { OperatorConsole } from '@/components/dashboard/operator-console'
import {
  explorerTxUrl,
  formatUsd,
  shortAddress,
} from '@/lib/format'

interface StatusPayload {
  role: string
  canAct: boolean
  canReadAudit: boolean
  network: string
  targetWallet: string
  position: {
    health_factor: number
    collateral_usd: number
    debt_usd: number
    network: string
    target_wallet: string
  } | null
  positionSource: string
  positionError: string | null
  circuit: {
    is_tripped: boolean
    failure_count: number
    last_failure_reason: string | null
  } | null
  hardLimits: {
    max_repayment_pct: number
    max_gas_price_gwei: number
  } | null
  recentAudit: Array<{
    id: string
    timestamp: string
    trigger_type: string
    position_state?: { health_factor?: number }
    llm_reasoning?: { proposed_tool_call?: string }
    guardrail_validation?: { status?: string }
    execution_details?: { execution_status?: string; tx_hash?: string }
  }>
  agent: { configured: boolean; healthy: boolean; error: string | null }
  pollIntervalMs: number
  nextPollAt: string | null
  lastCycleAt: string | null
  timestamp: string
}

interface PortfolioPayload {
  collateralUsd: number
  debtUsd: number
  healthFactor: number | null
  network: string
  source: string
  error: string | null
  allocation: Array<{
    token: string
    symbol: string
    percentage: number
    usdValue: number
    color: string
    isStable: boolean
  }>
  yields: { supplyApy: number; borrowApy: number; netApy: number }
  lastUpdated: string
}

function actionLabel(row: StatusPayload['recentAudit'][number]): string {
  const tool = row.llm_reasoning?.proposed_tool_call
  if (tool) {
    if (/soft|rebalance/i.test(tool)) return 'Soft Rebalance'
    if (/safe|exit/i.test(tool)) return 'Safe Exit'
    return tool.replace(/_/g, ' ')
  }
  if (row.trigger_type === 'SCHEDULED_CRON') return 'Health Check'
  if (row.trigger_type === 'MANUAL_OPERATOR') return 'Manual Action'
  return 'Cycle'
}

export function DashboardClient() {
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [statusRes, portfolioRes] = await Promise.allSettled([
        fetch('/api/status', { cache: 'no-store' }),
        fetch('/api/portfolio', { cache: 'no-store' }),
      ])

      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        const data = (await statusRes.value.json()) as StatusPayload
        setStatus(data)
        setError(null)
      } else {
        const reason =
          statusRes.status === 'rejected'
            ? String(statusRes.reason)
            : `Status ${statusRes.value.status}`
        throw new Error(reason)
      }

      if (portfolioRes.status === 'fulfilled' && portfolioRes.value.ok) {
        const data = (await portfolioRes.value.json()) as PortfolioPayload
        setPortfolio(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 15_000)
    return () => clearInterval(id)
  }, [load])

  function handleActionResult() {
    void load()
  }

  const hf = status?.position?.health_factor ?? null
  const nextMs =
    status?.nextPollAt != null
      ? new Date(status.nextPollAt).getTime() - Date.now()
      : status?.pollIntervalMs ?? null

  const lastCycle = status?.lastCycleAt
    ? new Date(status.lastCycleAt).toLocaleTimeString()
    : undefined

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-slate">
            Autonomous Treasury Rebalancer &amp; Yield Sentinel
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-card border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Position health hero */}
        <Card className="border-0 shadow-subtle">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Position Health</CardTitle>
              <CardDescription>
                Soft ≤ {HF_SOFT_REBALANCE} · Safe-exit ≤ {HF_SAFE_EXIT}
                {status?.positionSource
                  ? ` · source ${status.positionSource === 'aave' ? 'Aave' : status.positionSource}`
                  : ''}
              </CardDescription>
            </div>
            {status?.circuit?.is_tripped ? (
              <Badge tone="danger">Circuit tripped</Badge>
            ) : (
              <Badge tone="success">Circuit clear</Badge>
            )}
          </CardHeader>
          <CardContent className="flex flex-col items-center py-4">
            {loading && !status ? (
              <p className="py-20 text-slate">Loading position…</p>
            ) : status?.positionError && !status.position ? (
              <div className="text-center text-sm text-slate">
                <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-steel" />
                <p className="font-medium text-ink">Could not read Aave position</p>
                <p className="mt-1 max-w-sm">{status.positionError}</p>
                <p className="mt-3 text-xs">
                  Set <code className="text-ink">TARGET_WALLET</code> or fund a testnet position.
                </p>
              </div>
            ) : (
              <HfGauge healthFactor={hf} />
            )}
            {status?.targetWallet ? (
              <p className="mt-4 flex items-center gap-2 font-mono text-xs text-slate">
                Vault {shortAddress(status.targetWallet)} · {status.network}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <OperatorConsole
          canAct={Boolean(status?.canAct)}
          agentHealthy={Boolean(status?.agent?.healthy)}
          onResult={handleActionResult}
          compact
        />
      </div>

      <MetricCards
        collateralUsd={status?.position?.collateral_usd ?? portfolio?.collateralUsd ?? null}
        debtUsd={status?.position?.debt_usd ?? portfolio?.debtUsd ?? null}
        yieldApy={portfolio?.yields.netApy ?? null}
        nextAutomationMs={nextMs}
        collateralChange={null}
        debtChange={null}
        yieldChange={null}
        nextAutomationHint={
          lastCycle ? `Last cycle ${lastCycle}` : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Portfolio allocation */}
        <Card className="border-0 shadow-subtle">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Portfolio Allocation</CardTitle>
              <CardDescription>Projected collateral split</CardDescription>
            </div>
            <p className="text-sm text-slate">
              Total value{' '}
              <span className="font-semibold tabular-nums text-ink">
                {formatUsd(portfolio?.collateralUsd ?? status?.position?.collateral_usd ?? null)}
              </span>
            </p>
          </CardHeader>
          <CardContent>
            {portfolio?.allocation?.length ? (
              <PortfolioChart
                allocation={portfolio.allocation}
                totalValue={portfolio.collateralUsd}
              />
            ) : (
              <p className="py-10 text-center text-sm text-slate">
                Portfolio breakdown unavailable.
              </p>
            )}
            {portfolio?.source === 'demo' ? (
              <p className="mt-3 text-center text-xs text-steel">
                Estimated breakdown — live Aave read unavailable.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Recent audit trail */}
        <Card className="border-0 shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Recent Audit Trail</CardTitle>
              <CardDescription>Latest 5 records</CardDescription>
            </div>
            {status?.canReadAudit ? (
              <Link
                href="/audit"
                className="inline-flex items-center gap-1 text-xs font-medium text-cobalt hover:underline"
              >
                View all
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            ) : null}
          </CardHeader>
          <CardContent>
            {!status?.canReadAudit ? (
              <p className="text-sm text-slate">Audit trail is limited to Operators and Admins.</p>
            ) : !status.recentAudit?.length ? (
              <p className="text-sm text-slate">No audit rows yet. Run a cycle or force action.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-hairline text-xs uppercase tracking-wide text-slate">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Time</th>
                      <th className="py-2 pr-3 font-medium">Action</th>
                      <th className="py-2 pr-3 font-medium">Tx</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.recentAudit.map((row) => {
                      const tx = row.execution_details?.tx_hash
                      const st =
                        row.execution_details?.execution_status ??
                        row.guardrail_validation?.status ??
                        '—'
                      return (
                        <tr key={row.id} className="border-b border-hairline/80 last:border-0">
                          <td className="py-2.5 pr-3 text-slate">
                            {new Date(row.timestamp).toLocaleString()}
                            {row.position_state?.health_factor != null ? (
                              <span className="ml-1.5 text-xs text-steel">
                                HF {Number(row.position_state.health_factor).toFixed(2)}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2.5 pr-3 font-medium text-ink">{actionLabel(row)}</td>
                          <td className="py-2.5 pr-3">
                            {tx ? (
                              <a
                                href={explorerTxUrl(status.network ?? 'Base Sepolia', tx)}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-xs text-cobalt hover:underline"
                              >
                                {shortAddress(tx)}
                              </a>
                            ) : (
                              <span className="text-steel">—</span>
                            )}
                          </td>
                          <td className="py-2.5">
                            <Badge
                              tone={
                                st === 'CONFIRMED' || st === 'PASSED'
                                  ? 'success'
                                  : st === 'REJECTED' || st === 'REVERTED'
                                    ? 'danger'
                                    : 'neutral'
                              }
                            >
                              {st}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 text-xs text-steel">
        <Activity className="h-3.5 w-3.5" />
        Auto-refreshes every 15s
        {status?.timestamp
          ? ` · last fetch ${new Date(status.timestamp).toLocaleTimeString()}`
          : ''}
      </div>
    </div>
  )
}
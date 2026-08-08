'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldAlert,
  Zap,
} from 'lucide-react'
import { OperatorConsole } from '@/components/dashboard/operator-console'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AgentActionResponse } from '@/lib/agent-client'

export function ActionsClient() {
  const [agentHealthy, setAgentHealthy] = useState(false)
  const [history, setHistory] = useState<AgentActionResponse[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { agent?: { healthy?: boolean } }
      setAgentHealthy(Boolean(data.agent?.healthy))
    } catch {
      setAgentHealthy(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 20_000)
    return () => clearInterval(id)
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Operator Console</h1>
          <p className="mt-1 text-sm text-slate">
            Manual interventions use the same formula → brain → guardrails → KeeperHub path
            as the CLI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-subtle">
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                agentHealthy ? 'bg-forest/10' : 'bg-danger/10'
              }`}
            >
              <Activity
                className={`h-5 w-5 ${agentHealthy ? 'text-forest' : 'text-danger'}`}
              />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate">
                Agent Status
              </p>
              <p
                className={`text-lg font-semibold ${
                  agentHealthy ? 'text-forest' : 'text-danger'
                }`}
              >
                {agentHealthy ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
          <div className="h-10 w-px bg-hairline" />
          <div className="grid flex-1 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            <AgentStat label="Quick actions" value="Soft Rebalance" />
            <AgentStat label="Safe exit" value="Shield guardrail" />
            <AgentStat label="Live mode" value="KeeperHub web3" />
          </div>
        </CardContent>
      </Card>

      <OperatorConsole
        canAct
        agentHealthy={agentHealthy}
        onResult={(r) => setHistory((h) => [r, ...h].slice(0, 8))}
      />

      {history.length > 0 ? (
        <Card className="border-0 shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-slate" />
                Session results
              </CardTitle>
              <CardDescription>
                Latest {history.length} response{history.length > 1 ? 's' : ''} from
                this browser session
              </CardDescription>
            </div>
            <Badge tone="neutral">
              {history.filter((h) => h.ok).length}/{history.length} OK
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((h, i) => {
              const actionType = h.finalAction?.type ?? '—'
              const isSoft = /soft|rebalance/i.test(actionType)
              const isSafe = /safe|exit/i.test(actionType)
              return (
                <ResultRow
                  key={i}
                  ok={h.ok}
                  action={actionType}
                  actionIcon={isSafe ? ShieldAlert : isSoft ? Zap : null}
                  summary={h.brain?.llmReasoning?.thought_summary}
                  violations={h.guardrails?.violations}
                  txHash={h.execution?.keeperhub?.txHash}
                />
              )
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function AgentStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate">{label}</span>
      <span className="text-xs font-medium text-ink">{value}</span>
    </div>
  )
}

function ResultRow({
  ok,
  action,
  actionIcon: ActionIcon,
  summary,
  violations,
  txHash,
}: {
  ok: boolean
  action: string
  actionIcon: React.ComponentType<{ className?: string }> | null
  summary?: string
  violations?: string[]
  txHash?: string
}) {
  return (
    <div className="rounded-card border border-hairline bg-white px-4 py-3">
      <div className="flex flex-wrap items-start gap-2">
        <div
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            ok ? 'bg-forest/10' : 'bg-danger/10'
          }`}
        >
          {ok ? (
            <CheckCircle2 className="h-4 w-4 text-forest" />
          ) : (
            <AlertCircle className="h-4 w-4 text-danger" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink">
              {ok ? 'OK' : 'Failed'}
            </p>
            <Badge
              tone={ok ? 'success' : 'danger'}
              className="inline-flex items-center gap-1"
            >
              {ActionIcon ? <ActionIcon className="h-3 w-3" /> : null}
              {action}
            </Badge>
            {txHash ? (
              <code className="rounded-pill bg-ivory px-2 py-0.5 font-mono text-xs text-slate">
                tx confirmed
              </code>
            ) : null}
          </div>
          {summary ? (
            <p className="mt-1.5 text-sm leading-relaxed text-slate">{summary}</p>
          ) : null}
          {violations?.length ? (
            <p className="mt-1.5 text-sm text-danger">
              Violations: {violations.join('; ')}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Loader2, MessageSquare, Send, ShieldAlert, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { QuickPills } from '@/components/dashboard/quick-pills'
import type { AgentActionResponse } from '@/lib/agent-client'

export function OperatorConsole({
  canAct,
  agentHealthy,
  onResult,
  compact = false,
}: {
  canAct: boolean
  agentHealthy: boolean
  onResult?: (result: AgentActionResponse) => void
  compact?: boolean
}) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [last, setLast] = useState<AgentActionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(kind: 'chat' | 'force-soft' | 'force-safe', msg?: string) {
    if (!canAct) return
    setLoading(kind)
    setError(null)
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          message: msg ?? message,
        }),
      })
      const data = (await res.json()) as AgentActionResponse
      setLast(data)
      onResult?.(data)
      if (!data.ok) setError(data.error ?? 'Action failed')
      if (kind === 'chat' && data.ok) setMessage('')
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      setError(m)
    } finally {
      setLoading(null)
    }
  }

  if (!canAct) {
    return (
      <Card className="border-0 shadow-subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-4 w-4 text-slate" />
            Ask Sentinel
          </CardTitle>
          <CardDescription>Viewers can monitor status only.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-card border border-hairline bg-ivory px-4 py-3 text-sm text-slate">
            Operator or Admin role required for natural-language commands and force actions.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex h-full flex-col border-0 shadow-subtle">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-4 w-4 text-cobalt" />
            Ask Sentinel
          </CardTitle>
          {agentHealthy ? (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-forest/10 px-2.5 py-1 text-xs font-medium text-forest">
              <span className="h-1.5 w-1.5 rounded-full bg-forest" />
              Online
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger">
              <span className="h-1.5 w-1.5 rounded-full bg-danger" />
              Offline
            </span>
          )}
        </div>
        <CardDescription>
          {agentHealthy
            ? 'Natural language → formula → guardrails → KeeperHub'
            : 'Agent offline — start `pnpm --filter agent serve` and set AGENT_BASE_URL'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder='e.g. Check health factor and repay 20% if needed'
          disabled={!!loading || !agentHealthy}
          aria-label="Message for the Sentinel agent"
        />

        <QuickPills onPillClick={(action) => setMessage(action)} />

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="default"
            className="w-full"
            disabled={!!loading || !agentHealthy || !message.trim()}
            onClick={() => void run('chat')}
          >
            {loading === 'chat' ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send to Agent
          </Button>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!!loading || !agentHealthy}
              onClick={() => void run('force-soft', 'force soft rebalance')}
            >
              {loading === 'force-soft' ? <Loader2 className="animate-spin" /> : <Zap className="h-4 w-4" />}
              Force Soft Rebalance
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!!loading || !agentHealthy}
              onClick={() => void run('force-safe', 'force safe exit')}
            >
              {loading === 'force-safe' ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
              Force Safe-Exit
            </Button>
          </div>
        </div>

        {!compact ? (
          <p className="text-xs text-slate">
            Server defaults to KeeperHub dry-run. Set <code className="text-ink">ACTIONS_LIVE=1</code> on
            the web app for live execution.
          </p>
        ) : null}

        {error ? (
          <div className="rounded-card border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {last?.ok ? (
          <div className="rounded-card border border-hairline bg-ivory px-4 py-3 text-sm text-ink">
            <p className="font-medium">
              Action: {last.finalAction?.type ?? '—'}
              {last.execution?.executionStatus
                ? ` · ${last.execution.executionStatus}`
                : last.guardrails?.allowed
                  ? ' · guardrails passed'
                  : ''}
            </p>
            {last.brain?.llmReasoning?.thought_summary ? (
              <p className="mt-1 text-slate">{last.brain.llmReasoning.thought_summary}</p>
            ) : null}
            {last.execution?.keeperhub?.txHash ? (
              <p className="mt-1 font-mono text-xs text-cobalt">
                tx: {last.execution.keeperhub.txHash}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
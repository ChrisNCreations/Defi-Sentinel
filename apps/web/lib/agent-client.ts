/**
 * Server-only client for the agent HTTP API (Phase 7).
 * Manual actions proxy here so the agent owns formula → brain → guardrails → KH.
 */

export interface AgentStatusResponse {
  position: {
    protocol: string
    network: string
    target_wallet: string
    health_factor: number
    collateral_usd: number
    debt_usd: number
  }
  network: string
  networkLabel: string
  poolAddress: string
  hardGasCapGwei: number
  pollIntervalMs: number
  targetWallet: string
  organizationId: string | null
  timestamp: string
}

export interface AgentActionRequest {
  kind: 'chat' | 'force-soft' | 'force-safe' | 'guard' | 'cycle'
  actorWallet: string
  targetWallet?: string
  organizationId?: string
  message?: string
  network?: string
  mockHf?: number
  execute?: boolean
  dryRunKeeper?: boolean
  useBrain?: boolean
  scheduled?: boolean
}

export interface AgentActionResponse {
  ok: boolean
  error?: string
  softFailure?: boolean
  position?: AgentStatusResponse['position']
  formulaAction?: { type: string; repayPct?: number }
  finalAction?: { type: string; repayPct?: number }
  brain?: {
    intent: { kind: string; confidence: number }
    gas: { gasPriceGwei: number; source: string }
    llmReasoning: {
      model: string
      thought_summary: string
      proposed_tool_call: string
    }
    notes: string[]
  }
  guardrails?: {
    allowed: boolean
    violations: string[]
    rulesChecked: string[]
    organizationId: string | null
    auditExecutionId?: string
    effectiveRepayPct: number
  }
  execution?: {
    allowed: boolean
    executionStatus: string
    auditExecutionId?: string
    violations: string[]
    keeperhub?: {
      executionId?: string
      status?: string
      txHash?: string
      transport?: string
    }
  }
}

function agentBaseUrl(): string | null {
  const url = process.env.AGENT_BASE_URL ?? process.env.AGENT_INTERNAL_URL
  if (!url?.trim()) return null
  return url.replace(/\/$/, '')
}

function agentHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const secret = process.env.AGENT_INTERNAL_SECRET
  if (secret) {
    headers.Authorization = `Bearer ${secret}`
    headers['X-Agent-Secret'] = secret
  }
  return headers
}

export function isAgentConfigured(): boolean {
  return Boolean(agentBaseUrl())
}

export async function agentHealth(): Promise<{ ok: boolean; error?: string }> {
  const base = agentBaseUrl()
  if (!base) return { ok: false, error: 'AGENT_BASE_URL not set' }
  try {
    const res = await fetch(`${base}/v1/health`, {
      headers: agentHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function agentStatus(params: {
  wallet?: string
  network?: string
  mockHf?: number
}): Promise<AgentStatusResponse> {
  const base = agentBaseUrl()
  if (!base) throw new Error('AGENT_UNAVAILABLE: set AGENT_BASE_URL and run agent --serve')

  const q = new URLSearchParams()
  if (params.wallet) q.set('wallet', params.wallet)
  if (params.network) q.set('network', params.network)
  if (params.mockHf !== undefined) q.set('mockHf', String(params.mockHf))

  const res = await fetch(`${base}/v1/status?${q}`, {
    headers: agentHeaders(),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json()) as AgentStatusResponse & { error?: string; message?: string }
  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? `Agent status failed (${res.status})`)
  }
  return data
}

export async function agentAction(body: AgentActionRequest): Promise<AgentActionResponse> {
  const base = agentBaseUrl()
  if (!base) {
    return {
      ok: false,
      error: 'AGENT_UNAVAILABLE: set AGENT_BASE_URL and run `pnpm --filter agent serve`',
    }
  }

  const res = await fetch(`${base}/v1/actions`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(120_000),
  })

  const data = (await res.json()) as AgentActionResponse & { message?: string }
  if (!res.ok && !data.error) {
    data.ok = false
    data.error = data.message ?? `Agent action failed (${res.status})`
  }
  return data
}

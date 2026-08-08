import { NextResponse } from 'next/server'
import { POLL_INTERVAL_HOURS } from '@defi-sentinel/shared'
import { requireSession } from '@/lib/api-auth'
import { getPositionState, parseNetworkId } from '@/lib/aave/reader'
import { agentHealth, agentStatus, isAgentConfigured } from '@/lib/agent-client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Vault + agent status for dashboard.
 * Position: live Aave read (or mock via query). Circuit / recent audit from Supabase.
 */
export async function GET(request: Request) {
  const auth = await requireSession()
  if ('error' in auth) return auth.error
  const { session } = auth

  const url = new URL(request.url)
  const network = parseNetworkId(url.searchParams.get('network'))
  const mockHfRaw = url.searchParams.get('mockHf')
  const mockHf = mockHfRaw != null ? Number(mockHfRaw) : undefined
  const targetWallet =
    url.searchParams.get('wallet') ??
    process.env.TARGET_WALLET ??
    process.env.NEXT_PUBLIC_TARGET_WALLET ??
    session.wallet

  // Service role after session check — org policies join organization_members (recursive RLS).
  const supabase = createAdminClient()

  const [circuitRes, limitsRes, auditRes, agentOk] = await Promise.all([
    supabase
      .from('circuit_breaker')
      .select('is_tripped, failure_count, last_failure_at, last_failure_reason, tripped_at')
      .eq('organization_id', session.organizationId)
      .maybeSingle(),
    supabase
      .from('hard_limits')
      .select('max_repayment_pct, max_gas_price_gwei, max_consecutive_failures')
      .eq('organization_id', session.organizationId)
      .maybeSingle(),
    session.role === 'viewer'
      ? Promise.resolve({ data: null as null })
      : supabase
          .from('audit_logs')
          .select(
            'id, execution_id, timestamp, trigger_type, actor_wallet, position_state, guardrail_validation, execution_details, llm_reasoning',
          )
          .eq('organization_id', session.organizationId)
          .order('timestamp', { ascending: false })
          .limit(5),
    isAgentConfigured() ? agentHealth() : Promise.resolve({ ok: false, error: 'not configured' }),
  ])

  let position: {
    protocol: string
    network: string
    target_wallet: string
    health_factor: number
    collateral_usd: number
    debt_usd: number
  } | null = null
  let positionError: string | null = null
  let positionSource: 'aave' | 'agent' | 'mock' | 'none' = 'none'

  if (mockHf !== undefined && Number.isFinite(mockHf)) {
    position = {
      protocol: 'AaveV3',
      network: network === 'base-sepolia' ? 'Base Sepolia' : 'Ethereum Sepolia',
      target_wallet: targetWallet,
      health_factor: mockHf,
      collateral_usd: 10_000,
      debt_usd: 8_000,
    }
    positionSource = 'mock'
  } else {
    try {
      position = await getPositionState(network, targetWallet)
      positionSource = 'aave'
    } catch (err) {
      positionError = err instanceof Error ? err.message : String(err)
      // Fallback: try agent status
      if (isAgentConfigured()) {
        try {
          const st = await agentStatus({ wallet: targetWallet, network })
          position = st.position
          positionSource = 'agent'
          positionError = null
        } catch {
          /* keep aave error */
        }
      }
    }
  }

  const pollIntervalMs =
    Number(process.env.POLL_INTERVAL_MS) > 0
      ? Number(process.env.POLL_INTERVAL_MS)
      : POLL_INTERVAL_HOURS * 3_600_000

  // Estimate next poll from last SCHEDULED audit + interval
  let nextPollAt: string | null = null
  let lastCycleAt: string | null = null
  if (session.role !== 'viewer' && auditRes.data && Array.isArray(auditRes.data)) {
    const scheduled = auditRes.data.find(
      (r: { trigger_type?: string }) => r.trigger_type === 'SCHEDULED_CRON',
    )
    const any = auditRes.data[0]
    lastCycleAt = any?.timestamp ?? null
    if (scheduled?.timestamp) {
      nextPollAt = new Date(
        new Date(scheduled.timestamp).getTime() + pollIntervalMs,
      ).toISOString()
    }
  }

  return NextResponse.json({
    role: session.role,
    wallet: session.wallet,
    organizationId: session.organizationId,
    canAct: session.role === 'admin' || session.role === 'operator',
    canReadAudit: session.role === 'admin' || session.role === 'operator',
    network,
    targetWallet,
    position,
    positionSource,
    positionError,
    circuit: circuitRes.data,
    hardLimits: limitsRes.data,
    recentAudit: session.role === 'viewer' ? [] : (auditRes.data ?? []),
    agent: {
      configured: isAgentConfigured(),
      healthy: agentOk.ok,
      error: agentOk.ok ? null : agentOk.error,
    },
    pollIntervalMs,
    nextPollAt,
    lastCycleAt,
    thresholds: {
      soft: 1.3,
      safeExit: 1.1,
    },
    timestamp: new Date().toISOString(),
  })
}

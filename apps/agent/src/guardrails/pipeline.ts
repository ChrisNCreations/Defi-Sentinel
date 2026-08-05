import {
  EXECUTION_ROLES,
  type Action,
  type PositionState,
  type Role,
  type TriggerType,
} from '@defi-sentinel/shared'
import { writeAuditLog } from '../audit/writer'
import {
  checkCircuitBreaker,
  createSupabaseCircuitStore,
  type CircuitStore,
} from './circuit-breaker'
import { checkCloseFactor, repayPctForAction } from './close-factor'
import {
  checkHardLimits,
  defaultHardLimits,
  fetchHardLimits,
  type HardLimitsRow,
} from './hard-limits'
import { validateRole, type MemberLookup, type RoleCheckResult } from './role-validator'

export interface GuardrailContext {
  /** Wallet that initiated the action (operator/admin). Scheduled cron may omit. */
  actorWallet?: string
  /** When true, role check is skipped (autonomous poller uses service path). */
  scheduled?: boolean
  organizationId?: string
  action: Action
  position: PositionState
  gasPriceGwei: number
  targetContract?: string
  triggerType: TriggerType
  /** Soft rebalance % override for testing */
  proposedRepayPct?: number
  /**
   * Persist audit rows.
   * - `false`: never write
   * - `true` / default: write REJECTED always; write PASSED when `auditPasses` is true
   */
  writeAudit?: boolean
  /** When false, successful guardrail runs skip audit (execution path owns the final row). Default true. */
  auditPasses?: boolean
  dryRunAudit?: boolean
  /** Phase 5 LLM summary attached to audit (untrusted for amounts) */
  llmReasoning?: {
    model: string
    thought_summary: string
    proposed_tool_call: string
  }
  /** DI for tests */
  memberLookup?: MemberLookup
  circuitStore?: CircuitStore
  hardLimits?: HardLimitsRow
  /** Roles allowed to execute (default admin+operator) */
  requiredRoles?: Role[]
}

export interface GuardrailPipelineResult {
  allowed: boolean
  violations: string[]
  rulesChecked: string[]
  role: RoleCheckResult | null
  organizationId: string | null
  effectiveRepayPct: number
  auditExecutionId?: string
}

/**
 * Deterministic guardrail middleware — run before any KeeperHub call.
 * Order: 1) Role  2) Circuit breaker  3) Hard limits  4) Close-factor
 */
export async function runGuardrails(
  ctx: GuardrailContext,
): Promise<GuardrailPipelineResult> {
  const rulesChecked: string[] = []
  const violations: string[] = []
  let organizationId: string | null = ctx.organizationId ?? null
  let roleResult: RoleCheckResult | null = null

  const proposedRepayPct = ctx.proposedRepayPct ?? repayPctForAction(ctx.action)

  // 1. Role check (manual paths)
  if (!ctx.scheduled) {
    if (!ctx.actorWallet) {
      violations.push('ROLE_MISSING_ACTOR')
      rulesChecked.push('ROLE_VALIDATION')
    } else {
      roleResult = await validateRole(
        ctx.actorWallet,
        ctx.requiredRoles ?? EXECUTION_ROLES,
        ctx.memberLookup,
      )
      rulesChecked.push('ROLE_VALIDATION')
      // Keep org id even on ROLE_INSUFFICIENT so rejections can be audited
      if (roleResult.organizationId) {
        organizationId = roleResult.organizationId
      }
      if (!roleResult.allowed) {
        violations.push(roleResult.reason ?? 'ROLE_INSUFFICIENT')
      }
    }
  } else if (!organizationId) {
    violations.push('ORG_ID_REQUIRED_FOR_SCHEDULED')
    rulesChecked.push('ROLE_VALIDATION')
  } else {
    rulesChecked.push('ROLE_VALIDATION_SKIPPED_SCHEDULED')
  }

  // 2. Circuit breaker
  if (organizationId && violations.length === 0) {
    const store = ctx.circuitStore ?? createSupabaseCircuitStore()
    const state = await store.get(organizationId)
    const circuit = checkCircuitBreaker(state)
    rulesChecked.push(...circuit.rulesChecked)
    if (!circuit.ok) {
      violations.push(...circuit.violations)
    }
  }

  // 3. Hard limits
  if (organizationId && violations.length === 0 && ctx.action.type !== 'NONE') {
    const limits =
      ctx.hardLimits ??
      (ctx.circuitStore && !process.env.SUPABASE_URL
        ? defaultHardLimits()
        : await fetchHardLimitsSafe(organizationId, ctx.hardLimits))

    // SAFE_EXIT intentionally proposes 100% — hard limit max_repayment applies to soft rebalances.
    // Full exit is a separate product action; only SOFT_REBALANCE is capped by max_repayment_pct.
    const repayForLimits =
      ctx.action.type === 'SAFE_EXIT' ? 0 : proposedRepayPct

    const hard = checkHardLimits({
      proposedRepayPct: repayForLimits,
      gasPriceGwei: ctx.gasPriceGwei,
      targetContract: ctx.targetContract,
      limits,
    })
    rulesChecked.push(...hard.rulesChecked)
    if (!hard.ok) {
      violations.push(...hard.violations)
    }
  }

  // 4. Close-factor awareness
  let effectiveRepayPct = proposedRepayPct
  if (violations.length === 0 && ctx.action.type !== 'NONE') {
    const cf = checkCloseFactor({
      action: ctx.action,
      proposedRepayPct,
      debtUsd: ctx.position.debt_usd,
    })
    rulesChecked.push(...cf.rulesChecked)
    effectiveRepayPct = cf.effectiveRepayPct
    if (!cf.ok) {
      violations.push(...cf.violations)
    }
  }

  const allowed = violations.length === 0
  let auditExecutionId: string | undefined

  // Always audit rejections unless writeAudit === false.
  // Passes (including NONE) when auditPasses !== false — Phase 6 requires NONE rows on every cycle.
  // Set auditPasses false when KeeperHub path will write the final SOFT/SAFE row.
  const shouldAudit =
    ctx.writeAudit !== false && (!allowed || ctx.auditPasses !== false)

  // Audit rejections (and optional passes when writeAudit true)
  if (shouldAudit) {
    if (organizationId) {
      try {
        const audit = await writeAuditLog({
          organizationId,
          triggerType: ctx.triggerType,
          actorWallet: ctx.actorWallet,
          position: ctx.position,
          guardrailStatus: allowed ? 'PASSED' : 'REJECTED',
          rulesChecked: [...new Set(rulesChecked)],
          violations,
          executionStatus: allowed ? 'PENDING' : 'REJECTED',
          llmReasoning: ctx.llmReasoning,
          dryRun: ctx.dryRunAudit,
        })
        auditExecutionId = audit.execution_id
      } catch (err) {
        console.error('[guardrails] audit write failed', err)
      }
    } else if (!allowed) {
      console.warn('[guardrails] rejected but no organizationId — audit skipped', violations)
    }
  }

  return {
    allowed,
    violations,
    rulesChecked: [...new Set(rulesChecked)],
    role: roleResult,
    organizationId,
    effectiveRepayPct,
    auditExecutionId,
  }
}

async function fetchHardLimitsSafe(
  organizationId: string,
  override?: HardLimitsRow,
): Promise<HardLimitsRow> {
  if (override) return override
  try {
    return await fetchHardLimits(organizationId)
  } catch {
    return defaultHardLimits()
  }
}

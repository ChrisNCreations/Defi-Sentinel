import { DEFAULT_HARD_LIMITS } from '@defi-sentinel/shared'
import { getServiceSupabase } from '../supabase/client'

export interface HardLimitsRow {
  max_repayment_pct: number
  max_gas_price_gwei: number
  max_consecutive_failures: number
  allowed_contracts: string[]
}

export interface HardLimitsCheckInput {
  /** Proposed repay percentage of debt (SOFT_REBALANCE). SAFE_EXIT uses 100. */
  proposedRepayPct: number
  /** Estimated or current gas price in gwei */
  gasPriceGwei: number
  /** Target contract for execution (optional until Phase 4) */
  targetContract?: string
  limits: HardLimitsRow
}

export interface HardLimitsCheckResult {
  ok: boolean
  violations: string[]
  rulesChecked: string[]
}

export function defaultHardLimits(): HardLimitsRow {
  return {
    max_repayment_pct: DEFAULT_HARD_LIMITS.max_repayment_pct,
    max_gas_price_gwei: DEFAULT_HARD_LIMITS.max_gas_price_gwei,
    max_consecutive_failures: DEFAULT_HARD_LIMITS.max_consecutive_failures,
    allowed_contracts: [],
  }
}

/**
 * Pure hard-limits check — no I/O.
 * Gemini / Operators cannot override these values.
 */
export function checkHardLimits(input: HardLimitsCheckInput): HardLimitsCheckResult {
  const rulesChecked = [
    'MAX_REPAYMENT_PCT',
    'MAX_GAS_PRICE_GWEI',
    'ALLOWED_CONTRACTS',
  ]
  const violations: string[] = []
  const { limits } = input

  if (input.proposedRepayPct > limits.max_repayment_pct) {
    violations.push(
      `REPAY_PCT_EXCEEDED: proposed ${input.proposedRepayPct}% > max ${limits.max_repayment_pct}%`,
    )
  }

  if (input.gasPriceGwei > limits.max_gas_price_gwei) {
    violations.push(
      `GAS_PRICE_EXCEEDED: ${input.gasPriceGwei} gwei > max ${limits.max_gas_price_gwei} gwei`,
    )
  }

  if (
    input.targetContract &&
    limits.allowed_contracts.length > 0 &&
    !limits.allowed_contracts.map((c) => c.toLowerCase()).includes(input.targetContract.toLowerCase())
  ) {
    violations.push(`CONTRACT_NOT_ALLOWED: ${input.targetContract}`)
  }

  return {
    ok: violations.length === 0,
    violations,
    rulesChecked,
  }
}

export async function fetchHardLimits(organizationId: string): Promise<HardLimitsRow> {
  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('hard_limits')
    .select(
      'max_repayment_pct, max_gas_price_gwei, max_consecutive_failures, allowed_contracts',
    )
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(`HARD_LIMITS_FETCH_FAILED: ${error.message}`)
  }

  if (!data) {
    return defaultHardLimits()
  }

  return {
    max_repayment_pct: Number(data.max_repayment_pct),
    max_gas_price_gwei: Number(data.max_gas_price_gwei),
    max_consecutive_failures: Number(data.max_consecutive_failures),
    allowed_contracts: (data.allowed_contracts as string[] | null) ?? [],
  }
}

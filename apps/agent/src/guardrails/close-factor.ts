import { AAVE_CLOSE_FACTOR_PCT, type Action } from '@defi-sentinel/shared'

export interface CloseFactorCheckInput {
  action: Action
  /** Effective repay % of current debt (SOFT_REBALANCE uses action.repayPct) */
  proposedRepayPct: number
  debtUsd: number
  /**
   * Max single-tx repay fraction (Aave close factor). Default 50%.
   * Soft rebalances must stay within this; SAFE_EXIT may require multi-step later.
   */
  closeFactorPct?: number
}

export interface CloseFactorCheckResult {
  ok: boolean
  violations: string[]
  rulesChecked: string[]
  /** Effective repay % after close-factor awareness */
  effectiveRepayPct: number
}

/**
 * Aave close-factor awareness (deterministic).
 * - SOFT_REBALANCE must not exceed close factor (default 50%).
 * - SAFE_EXIT is allowed but flagged for multi-tx execution when debt is large.
 * - NONE always passes.
 */
export function checkCloseFactor(input: CloseFactorCheckInput): CloseFactorCheckResult {
  const closeFactor = input.closeFactorPct ?? AAVE_CLOSE_FACTOR_PCT
  const rulesChecked = ['AAVE_CLOSE_FACTOR']

  if (input.action.type === 'NONE') {
    return {
      ok: true,
      violations: [],
      rulesChecked,
      effectiveRepayPct: 0,
    }
  }

  if (input.action.type === 'SOFT_REBALANCE') {
    if (input.proposedRepayPct > closeFactor) {
      return {
        ok: false,
        violations: [
          `CLOSE_FACTOR_EXCEEDED: soft rebalance ${input.proposedRepayPct}% > close factor ${closeFactor}%`,
        ],
        rulesChecked,
        effectiveRepayPct: closeFactor,
      }
    }
    return {
      ok: true,
      violations: [],
      rulesChecked,
      effectiveRepayPct: input.proposedRepayPct,
    }
  }

  // SAFE_EXIT — full debt; single liquidation close-factor may require multiple steps in Phase 4
  if (input.debtUsd > 0 && input.proposedRepayPct > closeFactor) {
    return {
      ok: true,
      violations: [],
      rulesChecked: [...rulesChecked, 'SAFE_EXIT_MULTI_STEP_REQUIRED'],
      effectiveRepayPct: 100,
    }
  }

  return {
    ok: true,
    violations: [],
    rulesChecked,
    effectiveRepayPct: input.proposedRepayPct,
  }
}

export function repayPctForAction(action: Action): number {
  switch (action.type) {
    case 'NONE':
      return 0
    case 'SOFT_REBALANCE':
      return action.repayPct
    case 'SAFE_EXIT':
      return 100
  }
}

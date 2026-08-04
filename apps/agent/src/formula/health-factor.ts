import {
  AAVE_HF_INFINITE_THRESHOLD,
  HF_SAFE_EXIT,
  HF_SOFT_REBALANCE,
  SOFT_REBALANCE_REPAY_PCT,
  type Action,
  type PositionState,
} from '@defi-sentinel/shared'

/**
 * Pure, deterministic HF → action mapping.
 * No I/O, no Gemini, no side effects.
 *
 * Rules (checked in order):
 * - HF ≤ 1.10 → SAFE_EXIT
 * - HF ≤ 1.30 → SOFT_REBALANCE (20 %)
 * - otherwise → NONE
 *
 * Infinite / no-debt HF (Aave max uint) is treated as safe → NONE.
 */
export function decideAction(healthFactor: number): Action {
  if (!Number.isFinite(healthFactor) || healthFactor >= AAVE_HF_INFINITE_THRESHOLD) {
    return { type: 'NONE' }
  }

  if (healthFactor <= HF_SAFE_EXIT) {
    return { type: 'SAFE_EXIT' }
  }

  if (healthFactor <= HF_SOFT_REBALANCE) {
    return { type: 'SOFT_REBALANCE', repayPct: SOFT_REBALANCE_REPAY_PCT }
  }

  return { type: 'NONE' }
}

export function explainDecision(action: Action, healthFactor: number): string {
  const hfLabel = formatHf(healthFactor)

  switch (action.type) {
    case 'SAFE_EXIT':
      return `HF ${hfLabel} ≤ ${HF_SAFE_EXIT} → SAFE_EXIT (close risk)`
    case 'SOFT_REBALANCE':
      return `HF ${hfLabel} ≤ ${HF_SOFT_REBALANCE} → SOFT_REBALANCE (${action.repayPct}% debt)`
    case 'NONE':
      return `HF ${hfLabel} > ${HF_SOFT_REBALANCE} → NONE (monitor only)`
  }
}

export function buildDecision(position: PositionState): {
  action: Action
  position: PositionState
  reason: string
} {
  const action = decideAction(position.health_factor)
  return {
    action,
    position,
    reason: explainDecision(action, position.health_factor),
  }
}

function formatHf(healthFactor: number): string {
  if (!Number.isFinite(healthFactor) || healthFactor >= AAVE_HF_INFINITE_THRESHOLD) {
    return '∞'
  }
  return healthFactor.toFixed(4)
}

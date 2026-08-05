import {
  SOFT_REBALANCE_REPAY_PCT,
  type Action,
} from '@defi-sentinel/shared'
import type { GasEstimate, OperatorIntent, OperatorIntentKind } from './types'

/**
 * Map operator intent + formula action → execution action.
 * Gemini never chooses repay %. FORCE_* still uses fixed policy amounts.
 */
export function resolveActionFromIntent(
  formulaAction: Action,
  intent: OperatorIntent,
): { action: Action; notes: string[] } {
  const notes: string[] = []

  switch (intent.kind) {
    case 'CHECK_STATUS':
      notes.push('intent=CHECK_STATUS → no execution action')
      return { action: { type: 'NONE' }, notes }

    case 'REBALANCE_IF_NEEDED':
      notes.push('intent=REBALANCE_IF_NEEDED → follow formula')
      return { action: formulaAction, notes }

    case 'FORCE_SOFT':
      notes.push('intent=FORCE_SOFT → SOFT_REBALANCE at policy %')
      return {
        action: { type: 'SOFT_REBALANCE', repayPct: SOFT_REBALANCE_REPAY_PCT },
        notes,
      }

    case 'FORCE_SAFE':
      notes.push('intent=FORCE_SAFE → SAFE_EXIT')
      return { action: { type: 'SAFE_EXIT' }, notes }

    case 'UNKNOWN':
    default:
      notes.push('intent=UNKNOWN → treat as CHECK_STATUS')
      return { action: { type: 'NONE' }, notes }
  }
}

/** Clamp untrusted gas estimate under hard cap */
export function clampGasEstimate(
  estimate: GasEstimate,
  hardCapGwei: number,
): { gas: GasEstimate; notes: string[] } {
  const notes: string[] = []
  let gwei = estimate.gasPriceGwei
  if (!Number.isFinite(gwei) || gwei <= 0) {
    gwei = Math.min(1, hardCapGwei)
    notes.push('invalid gas from model → fallback 1 gwei (capped)')
  }
  if (gwei > hardCapGwei) {
    notes.push(`gas ${gwei} gwei clamped to hard cap ${hardCapGwei}`)
    gwei = hardCapGwei
  }
  return {
    gas: {
      ...estimate,
      gasPriceGwei: gwei,
      priorityFeeGwei:
        estimate.priorityFeeGwei != null
          ? Math.min(estimate.priorityFeeGwei, hardCapGwei)
          : undefined,
    },
    notes,
  }
}

export function parseIntentKind(raw: unknown): OperatorIntentKind {
  const s = String(raw ?? 'UNKNOWN').toUpperCase()
  if (
    s === 'CHECK_STATUS' ||
    s === 'REBALANCE_IF_NEEDED' ||
    s === 'FORCE_SOFT' ||
    s === 'FORCE_SAFE'
  ) {
    return s
  }
  return 'UNKNOWN'
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  try {
    const parsed = JSON.parse(candidate) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // try extract first {...}
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
      } catch {
        return null
      }
    }
  }
  return null
}

export function proposedToolCall(action: Action, intent: OperatorIntent): string {
  if (action.type === 'NONE') return `status_check(intent=${intent.kind})`
  if (action.type === 'SOFT_REBALANCE') {
    return `soft_rebalance(repayPct=${action.repayPct}, intent=${intent.kind})`
  }
  return `safe_exit(intent=${intent.kind})`
}

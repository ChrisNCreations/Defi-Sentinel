import type { Action, PositionState } from '@defi-sentinel/shared'

/** Structured intents Gemini may propose — always re-validated against formula + hard limits */
export type OperatorIntentKind =
  | 'CHECK_STATUS'
  | 'REBALANCE_IF_NEEDED'
  | 'FORCE_SOFT'
  | 'FORCE_SAFE'
  | 'UNKNOWN'

export interface OperatorIntent {
  kind: OperatorIntentKind
  /** Untrusted free-text from model; never used for amounts */
  note?: string
  confidence: number
}

export interface GasEstimate {
  /** Suggested gas price (gwei) including buffer — still subject to hard cap */
  gasPriceGwei: number
  priorityFeeGwei?: number
  source: 'gemini' | 'fallback' | 'cli'
  raw?: string
}

export interface LlmReasoning {
  model: string
  thought_summary: string
  proposed_tool_call: string
}

export interface BrainResult {
  /** Deterministic formula action (authoritative for amounts) */
  formulaAction: Action
  /** Action after intent resolution (still no Gemini-chosen %) */
  resolvedAction: Action
  intent: OperatorIntent
  gas: GasEstimate
  llmReasoning: LlmReasoning
  /** True if Gemini suggested something that was overridden/clamped */
  revalidated: boolean
  notes: string[]
}

export interface BrainContext {
  position: PositionState
  formulaAction: Action
  networkLabel: string
  hardGasCapGwei: number
  softRepayPct: number
  operatorMessage?: string
}

import type { Action, NetworkId, PositionState, TriggerType } from '@defi-sentinel/shared'

/**
 * Payload the agent sends to KeeperHub as workflow `input`.
 * Turnkey signing stays inside KeeperHub — this agent never sees private keys.
 */
export interface KeeperHubWorkflowInput {
  action: Action['type']
  repayPct: number
  network: NetworkId
  networkLabel: string
  chainId: number
  targetWallet: string
  actorWallet?: string
  healthFactor: number
  collateralUsd: number
  debtUsd: number
  repayUsd: number
  maxGasPriceGwei: number
  aavePoolAddress: string
  triggerType: TriggerType
  /** Agent-side correlation id (also used for audit) */
  executionId: string
  /** Explicit: agent does not sign; KeeperHub + Turnkey do */
  signing: 'turnkey_via_keeperhub'
}

export interface KeeperHubExecuteRequest {
  input: KeeperHubWorkflowInput
}

export type KeeperHubExecutionStatus =
  | 'running'
  | 'pending'
  | 'success'
  | 'failed'
  | 'error'
  | 'cancelled'
  | string

export interface KeeperHubExecutionRecord {
  id: string
  workflowId: string
  status: KeeperHubExecutionStatus
  input?: unknown
  output?: unknown
  error?: string | null
  errorCategory?: string | null
  errorType?: string | null
  errorCode?: string | null
  startedAt?: string
  completedAt?: string
  txHash?: string
  transactionHash?: string
  gasUsed?: string | number
  effectiveGasPriceGwei?: string | number
}

export interface KeeperHubExecuteStart {
  executionId: string
  status: KeeperHubExecutionStatus
}

export interface KeeperHubRunResult {
  workflowId: string
  executionId: string
  status: KeeperHubExecutionStatus
  simulationStatus: 'OK' | 'FAILED' | 'SKIPPED' | 'UNKNOWN'
  txHash?: string
  gasUsed?: string
  effectiveGasPriceGwei?: string
  retryAttempts: number
  raw?: KeeperHubExecutionRecord
  error?: string
}

export interface MapActionParams {
  action: Action
  position: PositionState
  networkId: NetworkId
  chainId: number
  aavePoolAddress: string
  maxGasPriceGwei: number
  effectiveRepayPct: number
  actorWallet?: string
  triggerType: TriggerType
  executionId: string
}

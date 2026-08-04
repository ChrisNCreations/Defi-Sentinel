import { SOFT_REBALANCE_REPAY_PCT, type Action } from '@defi-sentinel/shared'
import type { KeeperHubWorkflowInput, MapActionParams } from './types'

export function repayPctFromAction(action: Action, effectiveRepayPct?: number): number {
  if (action.type === 'NONE') return 0
  if (action.type === 'SAFE_EXIT') return effectiveRepayPct ?? 100
  return effectiveRepayPct ?? action.repayPct ?? SOFT_REBALANCE_REPAY_PCT
}

/**
 * Map formula Action + position → KeeperHub workflow input.
 * No private keys, no raw signed tx — Turnkey signs inside KeeperHub policy.
 */
export function mapActionToWorkflowInput(params: MapActionParams): KeeperHubWorkflowInput {
  const repayPct = repayPctFromAction(params.action, params.effectiveRepayPct)
  const repayUsd =
    params.action.type === 'NONE'
      ? 0
      : Math.round(((params.position.debt_usd * repayPct) / 100) * 100) / 100

  return {
    action: params.action.type,
    repayPct,
    network: params.networkId,
    networkLabel: params.position.network,
    chainId: params.chainId,
    targetWallet: params.position.target_wallet,
    actorWallet: params.actorWallet,
    healthFactor: params.position.health_factor,
    collateralUsd: params.position.collateral_usd,
    debtUsd: params.position.debt_usd,
    repayUsd,
    maxGasPriceGwei: params.maxGasPriceGwei,
    aavePoolAddress: params.aavePoolAddress,
    triggerType: params.triggerType,
    executionId: params.executionId,
    signing: 'turnkey_via_keeperhub',
  }
}

/** Pre-submit schema validation before KeeperHub call */
export function validateWorkflowInput(input: KeeperHubWorkflowInput): string[] {
  const errors: string[] = []
  if (!input.executionId) errors.push('MISSING_EXECUTION_ID')
  if (!input.targetWallet?.startsWith('0x')) errors.push('INVALID_TARGET_WALLET')
  if (!input.aavePoolAddress?.startsWith('0x')) errors.push('INVALID_POOL')
  if (input.action === 'SOFT_REBALANCE' && (input.repayPct <= 0 || input.repayPct > 50)) {
    errors.push('INVALID_REPAY_PCT_FOR_SOFT')
  }
  if (input.maxGasPriceGwei <= 0) errors.push('INVALID_GAS_CAP')
  if (input.signing !== 'turnkey_via_keeperhub') errors.push('INVALID_SIGNING_MODE')
  return errors
}

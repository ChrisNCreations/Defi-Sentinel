import { randomUUID } from 'crypto'
import type {
  Action,
  ExecutionStatus,
  NetworkId,
  PositionState,
  TriggerType,
} from '@defi-sentinel/shared'
import { writeAuditLog } from '../audit/writer'
import { hardGasCapGwei } from '../config'
import { getNetworkConfig } from '../config'
import {
  recordExecutionFailure,
  recordExecutionSuccess,
  type CircuitStore,
} from '../guardrails/circuit-breaker'
import { createKeeperHubClient, KeeperHubClient, KeeperHubError } from './client'
import { mapActionToWorkflowInput, validateWorkflowInput } from './payload'
import type { KeeperHubRunResult, KeeperHubWorkflowInput } from './types'

const CHAIN_IDS: Record<NetworkId, number> = {
  'base-sepolia': 84532,
  'eth-sepolia': 11155111,
}

export interface ExecutePathParams {
  action: Action
  position: PositionState
  networkId: NetworkId
  organizationId: string
  actorWallet?: string
  triggerType: TriggerType
  effectiveRepayPct: number
  gasPriceGwei: number
  rulesChecked: string[]
  /** Skip live KeeperHub (still builds payload + audit) */
  dryRun?: boolean
  /** Force audit dry-run even when executing live (tests) */
  dryRunAudit?: boolean
  client?: KeeperHubClient
  circuitStore?: CircuitStore
}

export interface ExecutePathResult {
  allowed: boolean
  executionStatus: ExecutionStatus
  workflowInput?: KeeperHubWorkflowInput
  keeperhub?: KeeperHubRunResult
  auditExecutionId?: string
  violations: string[]
}

/**
 * Full Phase 4 path after guardrails PASSED:
 * gas-cap check → map payload → KeeperHub execute → poll → audit → circuit update
 */
export async function executeViaKeeperHub(
  params: ExecutePathParams,
): Promise<ExecutePathResult> {
  const violations: string[] = []
  const gasCap = hardGasCapGwei()
  const network = getNetworkConfig(params.networkId)
  const executionId = randomUUID()

  // Respect hard gas cap (agent-side, before any external call)
  if (params.gasPriceGwei > gasCap) {
    violations.push(`GAS_PRICE_EXCEEDED: ${params.gasPriceGwei} > cap ${gasCap}`)
    const audit = await writeAuditLog({
      organizationId: params.organizationId,
      triggerType: params.triggerType,
      actorWallet: params.actorWallet,
      position: params.position,
      guardrailStatus: 'REJECTED',
      rulesChecked: [...params.rulesChecked, 'HARD_GAS_CAP'],
      violations,
      executionStatus: 'GAS_EXCEEDED',
      dryRun: params.dryRunAudit ?? params.dryRun,
    })
    return {
      allowed: false,
      executionStatus: 'GAS_EXCEEDED',
      auditExecutionId: audit.execution_id,
      violations,
    }
  }

  const workflowInput = mapActionToWorkflowInput({
    action: params.action,
    position: params.position,
    networkId: params.networkId,
    chainId: CHAIN_IDS[params.networkId],
    aavePoolAddress: network.poolAddress,
    maxGasPriceGwei: gasCap,
    effectiveRepayPct: params.effectiveRepayPct,
    actorWallet: params.actorWallet,
    triggerType: params.triggerType,
    executionId,
  })

  const schemaErrors = validateWorkflowInput(workflowInput)
  if (schemaErrors.length) {
    violations.push(...schemaErrors)
    const audit = await writeAuditLog({
      organizationId: params.organizationId,
      triggerType: params.triggerType,
      actorWallet: params.actorWallet,
      position: params.position,
      guardrailStatus: 'REJECTED',
      rulesChecked: [...params.rulesChecked, 'PAYLOAD_SCHEMA'],
      violations,
      executionStatus: 'REJECTED',
      dryRun: params.dryRunAudit ?? params.dryRun,
    })
    return {
      allowed: false,
      executionStatus: 'REJECTED',
      workflowInput,
      auditExecutionId: audit.execution_id,
      violations,
    }
  }

  if (params.dryRun || process.env.KEEPERHUB_DRY_RUN === '1') {
    console.log('[keeperhub] dry-run — payload only (no execute):', JSON.stringify(workflowInput, null, 2))
    const audit = await writeAuditLog({
      organizationId: params.organizationId,
      triggerType: params.triggerType,
      actorWallet: params.actorWallet,
      position: params.position,
      guardrailStatus: 'PASSED',
      rulesChecked: [...params.rulesChecked, 'KEEPERHUB_DRY_RUN'],
      violations: [],
      executionStatus: 'PENDING',
      dryRun: true,
    })
    return {
      allowed: true,
      executionStatus: 'PENDING',
      workflowInput,
      auditExecutionId: audit.execution_id,
      violations: [],
      keeperhub: {
        workflowId: process.env.KEEPERHUB_WORKFLOW_ID ?? 'dry-run',
        executionId,
        status: 'success',
        simulationStatus: 'SKIPPED',
        retryAttempts: 0,
      },
    }
  }

  const client = params.client ?? createKeeperHubClient()
  if (!client.configured) {
    throw new KeeperHubError('KeeperHub not configured', 'NOT_CONFIGURED')
  }

  let run: KeeperHubRunResult
  try {
    console.log('[keeperhub] executing workflow', client.workflowId)
    console.log('[keeperhub] signing=turnkey_via_keeperhub (agent holds no keys)')
    run = await client.executeAndWait(workflowInput, { maxRetries: 1 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    violations.push(`KEEPERHUB_ERROR: ${message}`)
    await recordExecutionFailure(params.organizationId, message, {
      store: params.circuitStore,
      alert: true,
    }).catch(() => undefined)

    const audit = await writeExecutionAudit(params, {
      executionStatus: 'SIMULATION_FAILED',
      simulationStatus: 'FAILED',
      workflowId: client.workflowId,
      executionId,
      retryAttempts: 0,
      error: message,
      rulesChecked: [...params.rulesChecked, 'KEEPERHUB_EXECUTE'],
      violations,
      dryRun: params.dryRunAudit ?? params.dryRun,
    })

    return {
      allowed: false,
      executionStatus: 'SIMULATION_FAILED',
      workflowInput,
      auditExecutionId: audit.execution_id,
      violations,
    }
  }

  const executionStatus = mapKeeperStatus(run)
  const failed = executionStatus !== 'CONFIRMED' && executionStatus !== 'PENDING'

  if (failed) {
    await recordExecutionFailure(
      params.organizationId,
      run.error ?? `status=${run.status}`,
      { store: params.circuitStore, alert: true },
    ).catch(() => undefined)
  } else {
    await recordExecutionSuccess(params.organizationId, params.circuitStore).catch(() => undefined)
  }

  const audit = await writeExecutionAudit(params, {
    executionStatus,
    simulationStatus: run.simulationStatus,
    workflowId: run.workflowId,
    executionId: run.executionId,
    txHash: run.txHash,
    gasUsed: run.gasUsed,
    effectiveGasPriceGwei: run.effectiveGasPriceGwei,
    retryAttempts: run.retryAttempts,
    error: run.error,
    rulesChecked: [...params.rulesChecked, 'KEEPERHUB_EXECUTE'],
    violations: failed ? [run.error ?? `KEEPERHUB_${run.status}`] : [],
    dryRun: params.dryRunAudit ?? params.dryRun,
  })

  return {
    allowed: !failed,
    executionStatus,
    workflowInput,
    keeperhub: run,
    auditExecutionId: audit.execution_id,
    violations: failed ? [run.error ?? String(run.status)] : [],
  }
}

function mapKeeperStatus(run: KeeperHubRunResult): ExecutionStatus {
  const s = run.status.toLowerCase()
  if (s === 'success' || s === 'completed') {
    return run.txHash ? 'CONFIRMED' : 'CONFIRMED' // workflow may succeed without on-chain tx
  }
  if (s === 'reverted') return 'REVERTED'
  if (run.simulationStatus === 'FAILED') return 'SIMULATION_FAILED'
  if (s === 'failed' || s === 'error' || s === 'cancelled') return 'REVERTED'
  return 'PENDING'
}

async function writeExecutionAudit(
  params: ExecutePathParams,
  details: {
    executionStatus: ExecutionStatus
    simulationStatus: string
    workflowId: string
    executionId: string
    txHash?: string
    gasUsed?: string
    effectiveGasPriceGwei?: string
    retryAttempts: number
    error?: string
    rulesChecked: string[]
    violations: string[]
    dryRun?: boolean
  },
) {
  // Use writeAuditLog base then we need richer execution_details — extend writer
  return writeAuditLog({
    organizationId: params.organizationId,
    triggerType: params.triggerType,
    actorWallet: params.actorWallet,
    position: params.position,
    guardrailStatus: details.violations.length ? 'REJECTED' : 'PASSED',
    rulesChecked: details.rulesChecked,
    violations: details.violations,
    executionStatus: details.executionStatus,
    dryRun: details.dryRun,
    executionDetails: {
      keeperhub_workflow_id: details.workflowId,
      tx_hash: details.txHash,
      simulation_status: details.simulationStatus,
      gas_used: details.gasUsed,
      effective_gas_price_gwei: details.effectiveGasPriceGwei,
      execution_status: details.executionStatus,
      retry_attempts: details.retryAttempts,
    },
  })
}

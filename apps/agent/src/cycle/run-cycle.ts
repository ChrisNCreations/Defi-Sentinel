import {
  NETWORK_LABEL,
  SOFT_REBALANCE_REPAY_PCT,
  type Action,
  type NetworkId,
  type PositionState,
  type TriggerType,
} from '@defi-sentinel/shared'
import { isAddress, type Address } from 'viem'
import { getPositionState } from '../aave/reader'
import { createGeminiClient } from '../brain/gemini'
import type { BrainResult } from '../brain/types'
import { getNetworkConfig, hardGasCapGwei, type KeeperHubTransport } from '../config'
import { decideAction, explainDecision } from '../formula/health-factor'
import { runGuardrails, type GuardrailPipelineResult } from '../guardrails/pipeline'
import { executeViaKeeperHub, type ExecutePathResult } from '../keeperhub/execute'

export type ForceMode = 'force-soft' | 'force-safe' | null

export interface RunCycleParams {
  network: NetworkId
  /** Wallet whose Aave position is read */
  targetWallet: string
  organizationId?: string
  actorWallet?: string
  triggerType: TriggerType
  /** Service path: skip role check (requires organizationId) */
  scheduled?: boolean
  mockHf?: number
  gasGwei: number
  useBrain: boolean
  operatorMessage?: string
  forceMode?: ForceMode
  execute: boolean
  dryRunKeeper: boolean
  dryRunAudit: boolean
  writeAudit: boolean
  transport: KeeperHubTransport
  /** Prefer Gemini gas over CLI default */
  preferBrainGas?: boolean
  /** Logger (default console) */
  log?: (line: string) => void
}

export interface RunCycleResult {
  ok: boolean
  position?: PositionState
  formulaAction?: Action
  finalAction?: Action
  brain?: BrainResult
  guardrails?: GuardrailPipelineResult
  exec?: ExecutePathResult
  /** Human-readable failure reason when ok=false */
  error?: string
  /** RPC / unexpected errors that should not kill the daemon */
  softFailure?: boolean
}

function formatAction(action: Action): string {
  if (action.type === 'SOFT_REBALANCE') return `SOFT_REBALANCE (${action.repayPct}%)`
  return action.type
}

function formatHf(hf: number): string {
  if (!Number.isFinite(hf)) return '∞'
  return hf.toFixed(4)
}

/**
 * Full decision path: position → formula → (Gemini) → guardrails → (KeeperHub) → audit.
 * Used by manual CLI modes and the scheduled poller.
 */
export async function runCycle(params: RunCycleParams): Promise<RunCycleResult> {
  const log = params.log ?? ((line: string) => console.log(line))

  // --- Position ---
  let position: PositionState
  if (params.mockHf !== undefined) {
    position = {
      protocol: 'AaveV3',
      network: NETWORK_LABEL[params.network],
      target_wallet: params.targetWallet,
      health_factor: params.mockHf,
      collateral_usd: 10_000,
      debt_usd: 8_000,
    }
    log('  position: mock (no RPC)')
  } else {
    if (!isAddress(params.targetWallet)) {
      return { ok: false, error: 'invalid target wallet', softFailure: false }
    }
    try {
      position = await getPositionState(params.network, params.targetWallet as Address)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log(`[cycle] Aave read failed: ${message}`)
      return {
        ok: false,
        error: `AAVE_READ_FAILED: ${message}`,
        softFailure: true,
      }
    }
  }

  log('\n--- Position ---')
  log(`  protocol: ${position.protocol}`)
  log(`  network: ${position.network}`)
  log(`  wallet: ${position.target_wallet}`)
  log(`  health_factor: ${formatHf(position.health_factor)}`)
  log(`  collateral_usd: ${position.collateral_usd.toFixed(2)}`)
  log(`  debt_usd: ${position.debt_usd.toFixed(2)}`)

  // --- Formula ---
  const formulaAction: Action =
    params.forceMode === 'force-soft'
      ? { type: 'SOFT_REBALANCE', repayPct: SOFT_REBALANCE_REPAY_PCT }
      : params.forceMode === 'force-safe'
        ? { type: 'SAFE_EXIT' }
        : decideAction(position.health_factor)

  log('\n--- Formula ---')
  log(`  action: ${formatAction(formulaAction)}`)
  log(`  reason: ${explainDecision(formulaAction, position.health_factor)}`)

  // --- Gemini (optional, untrusted) ---
  let finalAction = formulaAction
  let gasGwei = params.gasGwei
  let brain: BrainResult | undefined

  if (params.useBrain) {
    const gemini = createGeminiClient()
    const operatorMessage =
      params.operatorMessage ??
      (params.forceMode === 'force-soft'
        ? 'force soft rebalance'
        : params.forceMode === 'force-safe'
          ? 'force safe exit'
          : params.scheduled
            ? 'scheduled health check — rebalance if needed'
            : undefined)

    log('\n--- Gemini brain ---')
    log(`  configured: ${gemini.configured}`)
    log(`  message: ${operatorMessage ?? '(none)'}`)

    brain = await gemini.runBrain({
      position,
      formulaAction,
      networkLabel: NETWORK_LABEL[params.network],
      hardGasCapGwei: hardGasCapGwei(),
      softRepayPct: SOFT_REBALANCE_REPAY_PCT,
      operatorMessage,
    })

    if (params.forceMode === 'force-soft') {
      finalAction = { type: 'SOFT_REBALANCE', repayPct: SOFT_REBALANCE_REPAY_PCT }
    } else if (params.forceMode === 'force-safe') {
      finalAction = { type: 'SAFE_EXIT' }
    } else {
      finalAction = brain.resolvedAction
    }

    if (params.preferBrainGas !== false) {
      gasGwei = brain.gas.gasPriceGwei
    }

    log(`  intent: ${brain.intent.kind} (confidence ${brain.intent.confidence})`)
    log(`  resolved action: ${formatAction(finalAction)}`)
    log(`  gas (gwei): ${gasGwei} [${brain.gas.source}]`)
    log(`  thought: ${brain.llmReasoning.thought_summary}`)
    log(`  tool: ${brain.llmReasoning.proposed_tool_call}`)
    if (brain.notes.length) log(`  notes: ${brain.notes.join('; ')}`)
  } else {
    log('\n--- Brain skipped ---')
    log(`  action: ${formatAction(finalAction)}`)
    log(`  gas (gwei): ${gasGwei}`)
  }

  log('\n--- Proposed action ---')
  log(`  action: ${formatAction(finalAction)}`)
  log(`  actor: ${params.actorWallet ?? '(scheduled)'}`)
  log(`  trigger: ${params.triggerType}`)
  log(`  gas (gwei): ${gasGwei}`)

  const pool = getNetworkConfig(params.network).poolAddress

  // Guardrails: audit passes for NONE always; for execute path KH owns final SOFT/SAFE row
  const auditPasses = !params.execute || finalAction.type === 'NONE'

  const result = await runGuardrails({
    actorWallet: params.actorWallet,
    scheduled: params.scheduled === true,
    action: finalAction,
    position,
    gasPriceGwei: gasGwei,
    targetContract: pool,
    triggerType: params.triggerType,
    organizationId: params.organizationId,
    writeAudit: params.writeAudit,
    auditPasses,
    dryRunAudit: params.dryRunAudit,
    llmReasoning: brain?.llmReasoning,
  })

  log('\n--- Guardrails ---')
  log(`  allowed: ${result.allowed}`)
  log(`  rules: ${result.rulesChecked.join(', ') || '—'}`)
  log(`  violations: ${result.violations.join('; ') || 'none'}`)
  log(`  org: ${result.organizationId ?? '—'}`)
  log(`  role: ${result.role?.role ?? '—'}`)
  if (result.auditExecutionId) log(`  audit: ${result.auditExecutionId}`)

  if (!result.allowed) {
    log('\n[cycle] REJECTED — hard limits / role / circuit cannot be bypassed')
    return {
      ok: false,
      position,
      formulaAction,
      finalAction,
      brain,
      guardrails: result,
      error: result.violations.join('; ') || 'GUARDRAIL_REJECTED',
      softFailure: true,
    }
  }

  if (finalAction.type === 'NONE') {
    log('\n[cycle] action NONE — audited, nothing to execute')
    if (brain?.llmReasoning) {
      log(`  summary: ${brain.llmReasoning.thought_summary}`)
    }
    return {
      ok: true,
      position,
      formulaAction,
      finalAction,
      brain,
      guardrails: result,
    }
  }

  if (!params.execute) {
    log('\n[cycle] guardrails PASSED — execute disabled (no KeeperHub call)')
    return {
      ok: true,
      position,
      formulaAction,
      finalAction,
      brain,
      guardrails: result,
    }
  }

  if (!result.organizationId) {
    return {
      ok: false,
      position,
      formulaAction,
      finalAction,
      brain,
      guardrails: result,
      error: 'missing organizationId after guardrails',
      softFailure: false,
    }
  }

  log('\n--- KeeperHub ---')
  log(`  dryRun: ${params.dryRunKeeper}`)
  log('  keys: never loaded in agent (Turnkey via KeeperHub)')

  const exec = await executeViaKeeperHub({
    action: finalAction,
    position,
    networkId: params.network,
    organizationId: result.organizationId,
    actorWallet: params.actorWallet,
    triggerType: params.triggerType,
    effectiveRepayPct: result.effectiveRepayPct,
    gasPriceGwei: gasGwei,
    rulesChecked: [
      ...result.rulesChecked,
      ...(params.useBrain ? ['GEMINI_REVALIDATED'] : []),
    ],
    llmReasoning: brain?.llmReasoning,
    dryRun: params.dryRunKeeper,
    dryRunAudit: params.dryRunAudit,
    transport: params.transport,
  })

  log(`  execution_status: ${exec.executionStatus}`)
  log(`  allowed: ${exec.allowed}`)
  if (exec.keeperhub) {
    log(`  transport: ${exec.keeperhub.transport ?? params.transport}`)
    log(`  kh_execution: ${exec.keeperhub.executionId}`)
    log(`  kh_status: ${exec.keeperhub.status}`)
    if (exec.keeperhub.txHash) log(`  tx_hash: ${exec.keeperhub.txHash}`)
  }
  if (exec.auditExecutionId) log(`  audit: ${exec.auditExecutionId}`)
  if (brain?.llmReasoning) {
    log(`  llm_summary: ${brain.llmReasoning.thought_summary}`)
  }

  return {
    ok: exec.allowed,
    position,
    formulaAction,
    finalAction,
    brain,
    guardrails: result,
    exec,
    error: exec.allowed ? undefined : exec.violations.join('; ') || exec.executionStatus,
    softFailure: !exec.allowed,
  }
}

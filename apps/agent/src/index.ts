import 'dotenv/config'
import {
  HF_SAFE_EXIT,
  HF_SOFT_REBALANCE,
  NETWORK_LABEL,
  POLL_INTERVAL_HOURS,
  PRODUCT_NAME,
  SOFT_REBALANCE_REPAY_PCT,
  type Action,
  type PositionState,
} from '@defi-sentinel/shared'
import { isAddress, type Address } from 'viem'
import { getPositionState } from './aave/reader'
import { parseCliArgs, type AgentMode, getNetworkConfig } from './config'
import { buildDecision, decideAction, explainDecision } from './formula/health-factor'
import { runGuardrails } from './guardrails/pipeline'
import { executeViaKeeperHub } from './keeperhub/execute'

/**
 * Agent entry — Phase 4: formula → guardrails → KeeperHub (Turnkey) execution.
 * Gemini + poller land in later phases. Never import from apps/web.
 */
async function main() {
  const args = parseCliArgs(process.argv.slice(2))

  console.log(`[${PRODUCT_NAME}] agent starting`)
  console.log(`  thresholds: soft ≤ ${HF_SOFT_REBALANCE}, safe-exit ≤ ${HF_SAFE_EXIT}`)
  console.log(`  network: ${NETWORK_LABEL[args.network]}`)
  console.log(`  poll interval: ${POLL_INTERVAL_HOURS}h (scheduler in Phase 6)`)
  console.log(`  mode: ${args.mode}`)

  if (args.mode === 'force-soft' || args.mode === 'force-safe' || args.mode === 'guard') {
    await runGuardedAction(args)
    return
  }

  if (args.mode === 'decide') {
    await runDecide(args)
    return
  }

  if (args.mode === 'once' || args.once) {
    printFormulaSelfCheck()
    printGuardrailSelfCheck()
    console.log('[agent] --once complete')
    return
  }

  console.log('[agent] idle — press Ctrl+C to stop')
  console.log('[agent] tips:')
  console.log('  pnpm --filter agent force-soft -- --actor 0xOperator --mock-hf 1.2')
  console.log('  pnpm --filter agent force-soft -- --actor 0x… --mock-hf 1.2 --dry-run-keeper')

  const shutdown = () => {
    console.log('\n[agent] graceful shutdown')
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  await new Promise<void>(() => {})
}

async function runDecide(args: ReturnType<typeof parseCliArgs>) {
  if (args.mockHf !== undefined) {
    const action = decideAction(args.mockHf)
    const reason = explainDecision(action, args.mockHf)
    console.log('\n--- Decision (mock HF, no RPC) ---')
    console.log(`  health_factor: ${args.mockHf}`)
    console.log(`  action: ${formatAction(action)}`)
    console.log(`  reason: ${reason}`)
    return
  }

  if (!args.wallet || !isAddress(args.wallet)) {
    console.error('[agent] decide requires --wallet 0x… (or --mock-hf <number>)')
    process.exitCode = 1
    return
  }

  const wallet = args.wallet as Address
  console.log(`  wallet: ${wallet}`)

  let position: PositionState
  try {
    position = await getPositionState(args.network, wallet)
  } catch (err) {
    console.error('[agent] failed to read Aave position:', err instanceof Error ? err.message : err)
    process.exitCode = 1
    return
  }

  const decision = buildDecision(position)
  printPosition(position)
  console.log('\n--- Decision ---')
  console.log(`  action: ${formatAction(decision.action)}`)
  console.log(`  reason: ${decision.reason}`)
}

async function runGuardedAction(args: ReturnType<typeof parseCliArgs>) {
  const action = actionForMode(args.mode)
  if (!action) {
    process.exitCode = 1
    return
  }

  const actor = args.actor
  if (!actor || !isAddress(actor)) {
    console.error('[agent] force/guard requires --actor 0xOperatorWallet')
    process.exitCode = 1
    return
  }

  let position: PositionState

  if (args.mockHf !== undefined) {
    position = {
      protocol: 'AaveV3',
      network: NETWORK_LABEL[args.network],
      target_wallet: args.wallet ?? actor,
      health_factor: args.mockHf,
      collateral_usd: 10_000,
      debt_usd: 8_000,
    }
    console.log('  position: mock (no RPC)')
  } else {
    const target = (args.wallet ?? actor) as Address
    if (!isAddress(target)) {
      console.error('[agent] invalid --wallet')
      process.exitCode = 1
      return
    }
    try {
      position = await getPositionState(args.network, target)
    } catch (err) {
      console.error('[agent] Aave read failed:', err instanceof Error ? err.message : err)
      process.exitCode = 1
      return
    }
  }

  const finalAction = args.mode === 'guard' ? decideAction(position.health_factor) : action

  printPosition(position)
  console.log('\n--- Proposed action ---')
  console.log(`  action: ${formatAction(finalAction)}`)
  console.log(`  actor: ${actor}`)
  console.log(`  gas (gwei): ${args.gasGwei}`)

  const pool = getNetworkConfig(args.network).poolAddress

  // Guardrails write audit on reject; skip pass-audit so execution path owns final row
  const result = await runGuardrails({
    actorWallet: actor,
    action: finalAction,
    position,
    gasPriceGwei: args.gasGwei,
    targetContract: pool,
    triggerType: 'MANUAL_OPERATOR',
    organizationId: args.orgId,
    writeAudit: finalAction.type !== 'NONE' && !args.execute,
    dryRunAudit: args.dryRunAudit,
  })

  console.log('\n--- Guardrails ---')
  console.log(`  allowed: ${result.allowed}`)
  console.log(`  rules: ${result.rulesChecked.join(', ') || '—'}`)
  console.log(`  violations: ${result.violations.join('; ') || 'none'}`)
  console.log(`  org: ${result.organizationId ?? '—'}`)
  console.log(`  role: ${result.role?.role ?? '—'}`)

  if (!result.allowed) {
    console.error('\n[agent] REJECTED — execution blocked (no KeeperHub call)')
    process.exitCode = 1
    return
  }

  if (finalAction.type === 'NONE') {
    console.log('\n[agent] action NONE — nothing to execute')
    return
  }

  if (!args.execute) {
    console.log('\n[agent] guardrails PASSED — pass --execute / use force-* to call KeeperHub')
    console.log(`  effective repay %: ${result.effectiveRepayPct}`)
    return
  }

  if (!result.organizationId) {
    console.error('[agent] missing organizationId after guardrails')
    process.exitCode = 1
    return
  }

  console.log('\n--- KeeperHub ---')
  console.log(`  dryRun: ${args.dryRunKeeper}`)
  console.log('  keys: never loaded in agent (Turnkey via KeeperHub)')

  const exec = await executeViaKeeperHub({
    action: finalAction,
    position,
    networkId: args.network,
    organizationId: result.organizationId,
    actorWallet: actor,
    triggerType: 'MANUAL_OPERATOR',
    effectiveRepayPct: result.effectiveRepayPct,
    gasPriceGwei: args.gasGwei,
    rulesChecked: result.rulesChecked,
    dryRun: args.dryRunKeeper,
    dryRunAudit: args.dryRunAudit,
  })

  console.log(`  execution_status: ${exec.executionStatus}`)
  console.log(`  allowed: ${exec.allowed}`)
  if (exec.keeperhub) {
    console.log(`  kh_execution: ${exec.keeperhub.executionId}`)
    console.log(`  kh_status: ${exec.keeperhub.status}`)
    console.log(`  simulation: ${exec.keeperhub.simulationStatus}`)
    if (exec.keeperhub.txHash) console.log(`  tx_hash: ${exec.keeperhub.txHash}`)
  }
  if (exec.auditExecutionId) console.log(`  audit: ${exec.auditExecutionId}`)
  if (exec.violations.length) console.log(`  violations: ${exec.violations.join('; ')}`)

  if (!exec.allowed) {
    process.exitCode = 1
    return
  }

  console.log('\n[agent] Phase 4 path complete')
  if (!exec.keeperhub?.txHash) {
    console.log(
      '  note: workflow succeeded without tx_hash — ensure KeeperHub workflow has Aave repay steps for on-chain Soft Rebalance',
    )
  }
}

function actionForMode(mode: AgentMode): Action | null {
  if (mode === 'force-soft') {
    return { type: 'SOFT_REBALANCE', repayPct: SOFT_REBALANCE_REPAY_PCT }
  }
  if (mode === 'force-safe') {
    return { type: 'SAFE_EXIT' }
  }
  if (mode === 'guard') {
    return { type: 'NONE' }
  }
  return null
}

function printPosition(position: PositionState) {
  console.log('\n--- Position ---')
  console.log(`  protocol: ${position.protocol}`)
  console.log(`  network: ${position.network}`)
  console.log(`  wallet: ${position.target_wallet}`)
  console.log(`  health_factor: ${formatHf(position.health_factor)}`)
  console.log(`  collateral_usd: ${position.collateral_usd.toFixed(2)}`)
  console.log(`  debt_usd: ${position.debt_usd.toFixed(2)}`)
}

function formatAction(action: Action): string {
  if (action.type === 'SOFT_REBALANCE') return `SOFT_REBALANCE (${action.repayPct}%)`
  return action.type
}

function printFormulaSelfCheck() {
  const samples = [1.5, 1.3, 1.2, 1.1, 1.05, Number.POSITIVE_INFINITY]
  console.log('\n--- Formula self-check ---')
  for (const hf of samples) {
    console.log(`  HF ${formatHf(hf).padEnd(8)} → ${decideAction(hf).type}`)
  }
}

function printGuardrailSelfCheck() {
  console.log('\n--- Guardrail + execution order ---')
  console.log('  1. ROLE_VALIDATION')
  console.log('  2. CIRCUIT_BREAKER_OPEN')
  console.log('  3. HARD_LIMITS')
  console.log('  4. AAVE_CLOSE_FACTOR')
  console.log('  5. HARD_GAS_CAP → KeeperHub execute (Turnkey) → audit')
}

function formatHf(hf: number): string {
  if (!Number.isFinite(hf)) return '∞'
  return hf.toFixed(4)
}

main().catch((err) => {
  console.error('[agent] fatal', err)
  process.exit(1)
})

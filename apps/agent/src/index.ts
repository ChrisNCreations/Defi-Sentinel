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
import { createGeminiClient } from './brain/gemini'
import type { BrainResult } from './brain/types'
import { parseCliArgs, getNetworkConfig, hardGasCapGwei } from './config'
import { buildDecision, decideAction, explainDecision } from './formula/health-factor'
import { runGuardrails } from './guardrails/pipeline'
import { runDoctor, runListWorkflows } from './keeperhub/doctor'
import { executeViaKeeperHub } from './keeperhub/execute'
import { runKhCli } from './keeperhub/kh-cli'

/**
 * Agent entry — Phase 5: formula → Gemini brain → guardrails → KeeperHub.
 * Never import from apps/web. Gemini is untrusted; amounts stay formula/policy-only.
 */
async function main() {
  const args = parseCliArgs(process.argv.slice(2))

  console.log(`[${PRODUCT_NAME}] agent starting`)
  console.log(`  thresholds: soft ≤ ${HF_SOFT_REBALANCE}, safe-exit ≤ ${HF_SAFE_EXIT}`)
  console.log(`  network: ${NETWORK_LABEL[args.network]}`)
  console.log(`  poll interval: ${POLL_INTERVAL_HOURS}h (scheduler in Phase 6)`)
  console.log(`  mode: ${args.mode}`)

  if (args.mode === 'doctor') {
    process.exitCode = await runDoctor(args.transport)
    return
  }

  if (args.mode === 'list-workflows') {
    process.exitCode = await runListWorkflows()
    return
  }

  if (args.mode === 'kh') {
    process.exitCode = runKhCli(args.khArgs)
    return
  }

  if (
    args.mode === 'force-soft' ||
    args.mode === 'force-safe' ||
    args.mode === 'guard' ||
    args.mode === 'chat'
  ) {
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
  console.log(
    '  pnpm --filter agent chat -- --actor 0xOp --message "repay 20% if needed" --mock-hf 1.15',
  )
  console.log('  pnpm --filter agent force-soft -- --actor 0xOp --mock-hf 1.2 --transport rest')
  console.log('  pnpm --filter agent agent-doctor')
  console.log('  pnpm --filter agent list-workflows')
  console.log('  pnpm --filter agent kh -- workflow list')

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
    console.log('\n--- Decision (mock HF, no RPC) ---')
    console.log(`  health_factor: ${args.mockHf}`)
    console.log(`  action: ${formatAction(action)}`)
    console.log(`  reason: ${explainDecision(action, args.mockHf)}`)
    return
  }

  if (!args.wallet || !isAddress(args.wallet)) {
    console.error('[agent] decide requires --wallet 0x… (or --mock-hf <number>)')
    process.exitCode = 1
    return
  }

  const wallet = args.wallet as Address
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
  const actor = args.actor
  if (!actor || !isAddress(actor)) {
    console.error('[agent] requires --actor 0xOperatorWallet')
    process.exitCode = 1
    return
  }

  if (args.mode === 'chat' && !args.message?.trim()) {
    console.error('[agent] chat requires --message "…"')
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

  // 1) Formula (deterministic)
  const formulaAction =
    args.mode === 'force-soft'
      ? ({ type: 'SOFT_REBALANCE', repayPct: SOFT_REBALANCE_REPAY_PCT } as Action)
      : args.mode === 'force-safe'
        ? ({ type: 'SAFE_EXIT' } as Action)
        : decideAction(position.health_factor)

  printPosition(position)
  console.log('\n--- Formula ---')
  console.log(`  action: ${formatAction(formulaAction)}`)
  console.log(`  reason: ${explainDecision(formulaAction, position.health_factor)}`)

  // 2) Gemini brain (after formula, before guardrails) — untrusted
  let finalAction = formulaAction
  let gasGwei = args.gasGwei
  let brain: BrainResult | undefined

  if (args.useBrain) {
    const gemini = createGeminiClient()
    const operatorMessage =
      args.message ??
      (args.mode === 'force-soft'
        ? 'force soft rebalance'
        : args.mode === 'force-safe'
          ? 'force safe exit'
          : args.mode === 'guard'
            ? 'check status and rebalance if needed'
            : undefined)

    console.log('\n--- Gemini brain ---')
    console.log(`  configured: ${gemini.configured}`)
    console.log(`  message: ${operatorMessage ?? '(none)'}`)

    brain = await gemini.runBrain({
      position,
      formulaAction,
      networkLabel: NETWORK_LABEL[args.network],
      hardGasCapGwei: hardGasCapGwei(),
      softRepayPct: SOFT_REBALANCE_REPAY_PCT,
      operatorMessage,
    })

    // force-* CLI still overrides NL if operator used force-soft/safe explicitly
    if (args.mode === 'force-soft') {
      finalAction = { type: 'SOFT_REBALANCE', repayPct: SOFT_REBALANCE_REPAY_PCT }
    } else if (args.mode === 'force-safe') {
      finalAction = { type: 'SAFE_EXIT' }
    } else {
      finalAction = brain.resolvedAction
    }

    // Prefer CLI --gas-gwei only if user set non-default path: if message chat, use brain gas
    if (args.mode === 'chat' || !process.argv.some((a) => a.startsWith('--gas-gwei'))) {
      gasGwei = brain.gas.gasPriceGwei
    }

    console.log(`  intent: ${brain.intent.kind} (confidence ${brain.intent.confidence})`)
    console.log(`  resolved action: ${formatAction(finalAction)}`)
    console.log(`  gas (gwei): ${gasGwei} [${brain.gas.source}]`)
    console.log(`  thought: ${brain.llmReasoning.thought_summary}`)
    console.log(`  tool: ${brain.llmReasoning.proposed_tool_call}`)
    if (brain.notes.length) console.log(`  notes: ${brain.notes.join('; ')}`)
  } else {
    console.log(`\n--- Brain skipped ---`)
    console.log(`  action: ${formatAction(finalAction)}`)
    console.log(`  gas (gwei): ${gasGwei}`)
  }

  console.log('\n--- Proposed action ---')
  console.log(`  action: ${formatAction(finalAction)}`)
  console.log(`  actor: ${actor}`)
  console.log(`  gas (gwei): ${gasGwei}`)

  const pool = getNetworkConfig(args.network).poolAddress

  // 3) Guardrails (always after Gemini)
  const result = await runGuardrails({
    actorWallet: actor,
    action: finalAction,
    position,
    gasPriceGwei: gasGwei,
    targetContract: pool,
    triggerType: 'MANUAL_OPERATOR',
    organizationId: args.orgId,
    writeAudit: args.writeAudit,
    auditPasses: !args.execute || finalAction.type === 'NONE',
    dryRunAudit: args.dryRunAudit,
    llmReasoning: brain?.llmReasoning,
  })

  console.log('\n--- Guardrails ---')
  console.log(`  allowed: ${result.allowed}`)
  console.log(`  rules: ${result.rulesChecked.join(', ') || '—'}`)
  console.log(`  violations: ${result.violations.join('; ') || 'none'}`)
  console.log(`  org: ${result.organizationId ?? '—'}`)
  console.log(`  role: ${result.role?.role ?? '—'}`)

  if (!result.allowed) {
    console.error('\n[agent] REJECTED — Gemini cannot bypass guardrails')
    process.exitCode = 1
    return
  }

  if (finalAction.type === 'NONE') {
    console.log('\n[agent] action NONE — nothing to execute')
    if (brain?.llmReasoning) {
      console.log(`  summary: ${brain.llmReasoning.thought_summary}`)
    }
    return
  }

  if (!args.execute) {
    console.log('\n[agent] guardrails PASSED — use force-* / chat without --no-execute to run KeeperHub')
    return
  }

  if (!result.organizationId) {
    console.error('[agent] missing organizationId after guardrails')
    process.exitCode = 1
    return
  }

  // 4) KeeperHub
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
    gasPriceGwei: gasGwei,
    rulesChecked: [...result.rulesChecked, 'GEMINI_REVALIDATED'],
    llmReasoning: brain?.llmReasoning,
    dryRun: args.dryRunKeeper,
    dryRunAudit: args.dryRunAudit,
    transport: args.transport,
  })

  console.log(`  execution_status: ${exec.executionStatus}`)
  console.log(`  allowed: ${exec.allowed}`)
  if (exec.keeperhub) {
    console.log(`  transport: ${exec.keeperhub.transport ?? args.transport}`)
    console.log(`  kh_execution: ${exec.keeperhub.executionId}`)
    console.log(`  kh_status: ${exec.keeperhub.status}`)
    if (exec.keeperhub.txHash) console.log(`  tx_hash: ${exec.keeperhub.txHash}`)
  }
  if (exec.auditExecutionId) console.log(`  audit: ${exec.auditExecutionId}`)
  if (brain?.llmReasoning) {
    console.log(`  llm_summary: ${brain.llmReasoning.thought_summary}`)
  }

  if (!exec.allowed) {
    process.exitCode = 1
    return
  }

  console.log('\n[agent] Phase 5 path complete (formula → brain → guardrails → KeeperHub)')
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
  console.log('\n--- Pipeline order ---')
  console.log('  1. FORMULA (deterministic amounts)')
  console.log('  2. GEMINI brain (intent + gas + summary) — untrusted')
  console.log('  3. GUARDRAILS (role, circuit, hard limits, close factor)')
  console.log('  4. KEEPERHUB (Turnkey) + audit with llm_reasoning')
}

function formatHf(hf: number): string {
  if (!Number.isFinite(hf)) return '∞'
  return hf.toFixed(4)
}

main().catch((err) => {
  console.error('[agent] fatal', err)
  process.exit(1)
})

import 'dotenv/config'
import {
  HF_SAFE_EXIT,
  HF_SOFT_REBALANCE,
  NETWORK_LABEL,
  POLL_INTERVAL_HOURS,
  PRODUCT_NAME,
} from '@defi-sentinel/shared'
import { isAddress } from 'viem'
import { getPositionState } from './aave/reader'
import { parseCliArgs, getPollerConfig } from './config'
import { runCycle, type ForceMode } from './cycle/run-cycle'
import { buildDecision, decideAction, explainDecision } from './formula/health-factor'
import type { Action } from '@defi-sentinel/shared'
import { runDoctor, runListWorkflows } from './keeperhub/doctor'
import { runKhCli } from './keeperhub/kh-cli'
import { formatInterval, resolvePollIntervalMs, startScheduler } from './poller/scheduler'
import { runPollerTick } from './poller/tick'

/**
 * Agent entry — Phase 6: default daemon runs the 6h poller.
 * Path: formula → Gemini brain → guardrails → KeeperHub.
 * Never import from apps/web. Gemini is untrusted; amounts stay formula/policy-only.
 */
async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  const poller = getPollerConfig()

  console.log(`[${PRODUCT_NAME}] agent starting`)
  console.log(`  thresholds: soft ≤ ${HF_SOFT_REBALANCE}, safe-exit ≤ ${HF_SAFE_EXIT}`)
  console.log(`  network: ${NETWORK_LABEL[args.network]}`)
  console.log(
    `  poll interval: ${formatInterval(poller.pollIntervalMs)} (default ${POLL_INTERVAL_HOURS}h)`,
  )
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

  if (args.mode === 'once-cycle') {
    await runOnceCycle(args)
    return
  }

  if (args.mode === 'idle') {
    console.log('[agent] idle — press Ctrl+C to stop (no poller)')
    console.log('[agent] tips:')
    printTips()
    await waitForShutdown()
    return
  }

  // Default: Phase 6 scheduled poller
  await runPollerDaemon(args)
}

async function runPollerDaemon(args: ReturnType<typeof parseCliArgs>) {
  const poller = getPollerConfig()
  const targetWallet = args.wallet ?? poller.targetWallet
  const organizationId = args.orgId ?? poller.organizationId

  if (!targetWallet || !isAddress(targetWallet)) {
    console.error(
      '[agent] poller requires TARGET_WALLET or --wallet 0x… (Aave position to monitor)',
    )
    process.exitCode = 1
    return
  }
  if (!organizationId) {
    console.error(
      '[agent] poller requires ORGANIZATION_ID (or --org) for scheduled guardrails + audit',
    )
    process.exitCode = 1
    return
  }

  const intervalMs =
    resolvePollIntervalMs({
      pollIntervalMsEnv: process.env.POLL_INTERVAL_MS,
      pollIntervalHoursEnv: process.env.POLL_INTERVAL_HOURS,
      defaultHours: POLL_INTERVAL_HOURS,
    }) || poller.pollIntervalMs

  console.log('[agent] starting scheduled poller (Phase 6)')
  console.log(`  target: ${targetWallet}`)
  console.log(`  org: ${organizationId}`)
  console.log(`  interval: ${formatInterval(intervalMs)}`)
  console.log(`  execute: ${args.execute} dryRunKeeper: ${args.dryRunKeeper}`)
  console.log(`  brain: ${args.useBrain}`)
  console.log('  press Ctrl+C for graceful shutdown')

  const handle = startScheduler({
    intervalMs,
    runImmediately: !args.pollDeferFirst,
    onTick: async () => {
      await runPollerTick({
        network: args.network,
        targetWallet,
        organizationId,
        mockHf: args.mockHf,
        gasGwei: args.gasGwei,
        useBrain: args.useBrain,
        execute: args.execute,
        dryRunKeeper: args.dryRunKeeper,
        dryRunAudit: args.dryRunAudit,
        writeAudit: args.writeAudit,
        transport: args.transport,
      })
    },
  })

  await waitForShutdown(() => handle.stop())
}

async function runOnceCycle(args: ReturnType<typeof parseCliArgs>) {
  const poller = getPollerConfig()
  const targetWallet = args.wallet ?? poller.targetWallet
  const organizationId = args.orgId ?? poller.organizationId

  if (!targetWallet || !isAddress(targetWallet)) {
    console.error('[agent] once-cycle requires --wallet / TARGET_WALLET')
    process.exitCode = 1
    return
  }
  if (!organizationId) {
    console.error('[agent] once-cycle requires --org / ORGANIZATION_ID')
    process.exitCode = 1
    return
  }

  const result = await runPollerTick({
    network: args.network,
    targetWallet,
    organizationId,
    mockHf: args.mockHf,
    gasGwei: args.gasGwei,
    useBrain: args.useBrain,
    execute: args.execute,
    dryRunKeeper: args.dryRunKeeper,
    dryRunAudit: args.dryRunAudit,
    writeAudit: args.writeAudit,
    transport: args.transport,
  })

  if (!result.ok) process.exitCode = 1
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

  try {
    const position = await getPositionState(args.network, args.wallet)
    const decision = buildDecision(position)
    console.log('\n--- Position ---')
    console.log(`  protocol: ${position.protocol}`)
    console.log(`  network: ${position.network}`)
    console.log(`  wallet: ${position.target_wallet}`)
    console.log(`  health_factor: ${formatHf(position.health_factor)}`)
    console.log(`  collateral_usd: ${position.collateral_usd.toFixed(2)}`)
    console.log(`  debt_usd: ${position.debt_usd.toFixed(2)}`)
    console.log('\n--- Decision ---')
    console.log(`  action: ${formatAction(decision.action)}`)
    console.log(`  reason: ${decision.reason}`)
  } catch (err) {
    console.error('[agent] failed to read Aave position:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
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

  const targetWallet = args.wallet ?? actor
  const forceMode: ForceMode =
    args.mode === 'force-soft'
      ? 'force-soft'
      : args.mode === 'force-safe'
        ? 'force-safe'
        : null

  // Prefer CLI --gas-gwei when user set it explicitly for non-chat modes
  const preferBrainGas =
    args.mode === 'chat' || !process.argv.some((a) => a.startsWith('--gas-gwei'))

  const result = await runCycle({
    network: args.network,
    targetWallet,
    organizationId: args.orgId,
    actorWallet: actor,
    triggerType: 'MANUAL_OPERATOR',
    scheduled: false,
    mockHf: args.mockHf,
    gasGwei: args.gasGwei,
    useBrain: args.useBrain,
    operatorMessage: args.message,
    forceMode,
    execute: args.execute,
    dryRunKeeper: args.dryRunKeeper,
    dryRunAudit: args.dryRunAudit,
    writeAudit: args.writeAudit,
    transport: args.transport,
    preferBrainGas,
  })

  if (!result.ok) {
    process.exitCode = 1
    return
  }

  if (result.finalAction && result.finalAction.type !== 'NONE' && args.execute) {
    console.log('\n[agent] path complete (formula → brain → guardrails → KeeperHub)')
  }
}

function printTips() {
  console.log(
    '  pnpm --filter agent chat -- --actor 0xOp --message "repay 20% if needed" --mock-hf 1.15',
  )
  console.log('  pnpm --filter agent force-soft -- --actor 0xOp --mock-hf 1.2 --transport rest')
  console.log(
    '  pnpm --filter agent once-cycle -- --wallet 0x… --org <uuid> --mock-hf 1.5 --dry-run-keeper',
  )
  console.log('  pnpm --filter agent agent-doctor')
  console.log('  pnpm --filter agent list-workflows')
}

function waitForShutdown(onStop?: () => void): Promise<void> {
  return new Promise((resolve) => {
    const shutdown = () => {
      console.log('\n[agent] graceful shutdown')
      onStop?.()
      resolve()
      process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })
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
  console.log('  5. POLLER every POLL_INTERVAL (Phase 6)')
}

function formatHf(hf: number): string {
  if (!Number.isFinite(hf)) return '∞'
  return hf.toFixed(4)
}

main().catch((err) => {
  console.error('[agent] fatal', err)
  process.exit(1)
})

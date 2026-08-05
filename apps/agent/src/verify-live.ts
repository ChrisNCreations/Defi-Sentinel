/**
 * Live Supabase smoke check for Phase 1 + 3.
 * Usage: pnpm --filter agent exec tsx src/verify-live.ts
 * Loads apps/agent/.env via dotenv.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { runGuardrails } from './guardrails/pipeline'
import { writeAuditLog } from './audit/writer'
import { validateRole } from './guardrails/role-validator'
import {
  createSupabaseCircuitStore,
  recordExecutionFailure,
  resetCircuitBreaker,
} from './guardrails/circuit-breaker'

const ORG_ID = 'a0000000-0000-4000-8000-000000000001'
/** Privileged seed only — viewers are public (any non-privileged wallet). */
const SEED = {
  admin: '0x25d8be971f8c5e7c6afc8645a08d43b506a8e051',
  operator: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
} as const
/** Synthetic public viewer for agent guardrail checks (not required in seed). */
const PUBLIC_VIEWER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

async function main() {
  const url = requireEnv('SUPABASE_URL')
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  console.log('[verify-live] host:', new URL(url).host)

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1) Schema present?
  const tables = [
    'organizations',
    'profiles',
    'organization_members',
    'hard_limits',
    'circuit_breaker',
    'audit_logs',
  ] as const

  console.log('\n--- Schema ---')
  for (const t of tables) {
    const { error } = await sb.from(t).select('*').limit(1)
    if (error) {
      console.error(`  FAIL ${t}:`, error.message)
      if (error.message.includes('does not exist') || error.code === '42P01') {
        console.error(
          '\nTables missing. Apply migrations in Supabase SQL editor:\n' +
            '  supabase/migrations/001_initial_schema.sql\n' +
            '  supabase/migrations/002_rls_policies.sql\n' +
            '  supabase/migrations/003_audit_append_only.sql\n' +
            '  supabase/migrations/004_seed.sql\n',
        )
        process.exit(1)
      }
    } else {
      console.log(`  OK  ${t}`)
    }
  }

  // 2) Ensure seed org + members (idempotent)
  console.log('\n--- Seed ---')
  await sb.from('organizations').upsert(
    {
      id: ORG_ID,
      keeperhub_org_id: 'kh_org_defi_sentinel_testnet',
      name: 'DeFi Sentinel Testnet Org',
    },
    { onConflict: 'keeperhub_org_id' },
  )

  // org id may already exist under different keeperhub id — resolve
  const { data: org } = await sb
    .from('organizations')
    .select('id')
    .eq('keeperhub_org_id', 'kh_org_defi_sentinel_testnet')
    .maybeSingle()

  const orgId = org?.id ?? ORG_ID

  await sb.from('hard_limits').upsert(
    {
      organization_id: orgId,
      max_repayment_pct: 30,
      max_gas_price_gwei: 50,
      max_consecutive_failures: 3,
      allowed_contracts: [
        '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
        '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
      ],
      updated_by: 'verify-live',
    },
    { onConflict: 'organization_id' },
  )

  await sb.from('circuit_breaker').upsert(
    {
      organization_id: orgId,
      is_tripped: false,
      failure_count: 0,
      last_failure_at: null,
      last_failure_reason: null,
      tripped_at: null,
    },
    { onConflict: 'organization_id' },
  )

  for (const [role, wallet] of Object.entries(SEED)) {
    const { error } = await sb.from('organization_members').upsert(
      {
        organization_id: orgId,
        wallet_address: wallet,
        role,
      },
      { onConflict: 'organization_id,wallet_address' },
    )
    if (error) console.error(`  member ${role} fail:`, error.message)
    else console.log(`  OK  ${role} ${wallet.slice(0, 8)}…`)
  }

  // Optional: enroll a public viewer (simulates SIWE auto-enroll) for ROLE_INSUFFICIENT check
  await sb.from('organization_members').upsert(
    {
      organization_id: orgId,
      wallet_address: PUBLIC_VIEWER,
      role: 'viewer',
    },
    { onConflict: 'organization_id,wallet_address' },
  )
  console.log(`  OK  public viewer (test) ${PUBLIC_VIEWER.slice(0, 10)}…`)

  // 3) Role validator (live)
  console.log('\n--- Role validator ---')
  const op = await validateRole(SEED.operator, ['admin', 'operator'])
  const vw = await validateRole(PUBLIC_VIEWER, ['admin', 'operator'])
  const unknown = await validateRole(
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ['admin', 'operator'],
  )
  console.log(
    `  operator allowed=${op.allowed} role=${op.role} org=${op.organizationId?.slice(0, 8)}…`,
  )
  console.log(
    `  public viewer allowed=${vw.allowed} reason=${vw.reason} role=${vw.role}`,
  )
  console.log(
    `  unknown wallet allowed=${unknown.allowed} reason=${unknown.reason}`,
  )
  if (!op.allowed) throw new Error('Operator should pass')
  if (vw.allowed || vw.reason !== 'ROLE_INSUFFICIENT') {
    throw new Error('Public viewer should be ROLE_INSUFFICIENT for execution')
  }
  if (unknown.allowed || unknown.reason !== 'WALLET_NOT_FOUND') {
    throw new Error('Unknown wallet should be WALLET_NOT_FOUND for execution')
  }
  console.log('  OK role matrix (public viewers cannot execute)')

  // 4) Guardrail pipeline (live hard_limits + circuit)
  console.log('\n--- Guardrails pipeline ---')
  const position = {
    protocol: 'AaveV3' as const,
    network: 'Base Sepolia' as const,
    target_wallet: SEED.operator,
    health_factor: 1.15,
    collateral_usd: 10_000,
    debt_usd: 8_000,
  }

  const pass = await runGuardrails({
    actorWallet: SEED.operator,
    action: { type: 'SOFT_REBALANCE', repayPct: 20 },
    position,
    gasPriceGwei: 20,
    triggerType: 'MANUAL_OPERATOR',
    writeAudit: true,
    dryRunAudit: false,
  })
  console.log(`  operator soft: allowed=${pass.allowed} audit=${pass.auditExecutionId ?? 'none'}`)
  if (!pass.allowed) {
    console.error('  violations:', pass.violations)
    throw new Error('Operator soft rebalance should pass')
  }

  const reject = await runGuardrails({
    actorWallet: PUBLIC_VIEWER,
    action: { type: 'SOFT_REBALANCE', repayPct: 20 },
    position,
    gasPriceGwei: 20,
    triggerType: 'MANUAL_OPERATOR',
    writeAudit: true,
    dryRunAudit: false,
  })
  console.log(
    `  public viewer soft: allowed=${reject.allowed} violations=${reject.violations.join(',')}`,
  )
  if (reject.allowed || !reject.violations.includes('ROLE_INSUFFICIENT')) {
    throw new Error('Public viewer should be rejected for execution')
  }

  const gasReject = await runGuardrails({
    actorWallet: SEED.operator,
    action: { type: 'SOFT_REBALANCE', repayPct: 20 },
    position,
    gasPriceGwei: 99,
    triggerType: 'MANUAL_OPERATOR',
    writeAudit: true,
    dryRunAudit: false,
  })
  console.log(
    `  gas 99gwei: allowed=${gasReject.allowed} violations=${gasReject.violations.join(';')}`,
  )
  if (gasReject.allowed) throw new Error('High gas should reject')

  // 5) Circuit breaker trip path (then reset)
  console.log('\n--- Circuit breaker ---')
  const store = createSupabaseCircuitStore()
  await resetCircuitBreaker(orgId, store)
  await recordExecutionFailure(orgId, 'verify-live-1', { store, alert: false, maxConsecutiveFailures: 3 })
  await recordExecutionFailure(orgId, 'verify-live-2', { store, alert: false, maxConsecutiveFailures: 3 })
  const tripped = await recordExecutionFailure(orgId, 'verify-live-3', {
    store,
    alert: false,
    maxConsecutiveFailures: 3,
  })
  console.log(`  after 3 fails: tripped=${tripped.isTripped} count=${tripped.failureCount}`)

  const halted = await runGuardrails({
    actorWallet: SEED.operator,
    action: { type: 'SAFE_EXIT' },
    position: { ...position, health_factor: 1.05 },
    gasPriceGwei: 10,
    triggerType: 'MANUAL_OPERATOR',
    writeAudit: true,
    dryRunAudit: false,
  })
  console.log(`  while tripped: allowed=${halted.allowed} ${halted.violations.join(';')}`)
  if (halted.allowed) throw new Error('Should halt when circuit tripped')

  await resetCircuitBreaker(orgId, store)
  console.log('  OK circuit reset')

  // 6) Audit append-only sample
  console.log('\n--- Audit write ---')
  const audit = await writeAuditLog({
    organizationId: orgId,
    triggerType: 'MANUAL_OPERATOR',
    actorWallet: SEED.operator,
    position,
    guardrailStatus: 'PASSED',
    rulesChecked: ['VERIFY_LIVE'],
    violations: [],
    executionStatus: 'PENDING',
    dryRun: false,
  })
  console.log(`  inserted execution_id=${audit.execution_id}`)

  const { count, error: countErr } = await sb
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  if (countErr) console.warn('  count warn:', countErr.message)
  else console.log(`  audit rows for org: ${count}`)

  console.log('\n[verify-live] ALL CHECKS PASSED')
}

main().catch((err) => {
  console.error('\n[verify-live] FAILED', err instanceof Error ? err.message : err)
  process.exit(1)
})

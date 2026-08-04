/**
 * Optional helper: print seed wallet instructions.
 * Membership rows live in supabase/migrations/004_seed.sql
 *
 * Usage: pnpm --filter agent seed-roles
 */
const SEED = [
  {
    role: 'admin',
    wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    note: 'Anvil/Hardhat account #0',
  },
  {
    role: 'operator',
    wallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    note: 'Anvil/Hardhat account #1',
  },
  {
    role: 'viewer',
    wallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    note: 'Anvil/Hardhat account #2 — cannot read audit_logs (RLS)',
  },
] as const

console.log('DeFi Sentinel — seed wallets (from 004_seed.sql)\n')
for (const row of SEED) {
  console.log(`  ${row.role.padEnd(10)} ${row.wallet}`)
  console.log(`             ${row.note}\n`)
}
console.log('Apply migrations: supabase db reset')
console.log('Then sign in at /login with the matching wallet (SIWE).')

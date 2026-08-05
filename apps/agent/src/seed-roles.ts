/**
 * Print privileged seed wallets + public-viewer model.
 * Membership rows: supabase/migrations/004_seed.sql
 * Public viewers: auto-enrolled at SIWE (any wallet that is not admin/operator).
 *
 * Usage: pnpm --filter agent seed-roles
 */
const PRIVILEGED = [
  {
    role: 'admin',
    wallet: '0x25D8bE971f8c5E7C6aFC8645a08D43B506A8e051',
    note: 'Project admin wallet',
  },
  {
    role: 'operator',
    wallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    note: 'Anvil/Hardhat account #1 (replace for production ops)',
  },
] as const

console.log('DeFi Sentinel — privileged wallets (seed)\n')
for (const row of PRIVILEGED) {
  console.log(`  ${row.role.padEnd(10)} ${row.wallet}`)
  console.log(`             ${row.note}\n`)
}
console.log('  viewer     <any other wallet>')
console.log('             Public: SIWE connect → auto-enrolled as viewer (dashboard only)\n')
console.log('Apply seed: supabase migrations / verify-live')
console.log('Sign in at /login — unknown wallets join as Viewer, never as Admin/Operator.')

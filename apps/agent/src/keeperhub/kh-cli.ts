import { spawnSync } from 'node:child_process'

/**
 * Optional wrapper around the KeeperHub `kh` binary for ops.
 * Never required for force-soft / chat product path.
 */
export function runKhCli(args: string[]): number {
  const check = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['kh'], {
    encoding: 'utf8',
  })
  if (check.status !== 0) {
    console.error('[kh] KeeperHub CLI not found on PATH.')
    console.error('  Install: brew install keeperhub/tap/kh')
    console.error('  Or: https://github.com/keeperhub/cli/releases')
    console.error('  Auth: kh auth login   or   set KH_API_KEY / KEEPERHUB_API_KEY')
    console.error('  Product agent does not need `kh` — use REST/MCP via force-soft / doctor.')
    return 1
  }

  // Prefer KH_API_KEY; fall back to our env name for convenience
  const env = {
    ...process.env,
    KH_API_KEY: process.env.KH_API_KEY || process.env.KEEPERHUB_API_KEY || '',
  }

  if (!args.length) {
    console.log('[kh] usage examples:')
    console.log('  pnpm --filter agent kh -- workflow list')
    console.log('  pnpm --filter agent kh -- workflow run <id> --wait')
    console.log('  pnpm --filter agent kh -- run status <run-id>')
    console.log('  pnpm --filter agent kh -- run logs <run-id>')
    return 0
  }

  // Block marketplace-oriented accidental usage in our wrapper (soft warn)
  const joined = args.join(' ')
  if (/\bmarketplace\b|call_workflow|search_workflows/i.test(joined)) {
    console.error('[kh] marketplace commands are out of scope for DeFi Sentinel.')
    return 1
  }

  console.log(`[kh] running: kh ${args.join(' ')}`)
  const r = spawnSync('kh', args, {
    encoding: 'utf8',
    env,
    stdio: 'inherit',
  })
  return r.status ?? 1
}

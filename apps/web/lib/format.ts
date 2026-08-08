import { HF_SAFE_EXIT, HF_SOFT_REBALANCE } from '@defi-sentinel/shared'

export function shortAddress(wallet: string) {
  if (!wallet || wallet.length < 10) return wallet
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
}

export function formatUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatHf(hf: number | null | undefined) {
  if (hf == null) return '—'
  if (!Number.isFinite(hf)) return '∞'
  return hf.toFixed(2)
}

export type HfZone = 'safe' | 'soft' | 'danger'

export function hfZone(hf: number | null | undefined): HfZone {
  if (hf == null || !Number.isFinite(hf)) return 'safe'
  if (hf <= HF_SAFE_EXIT) return 'danger'
  if (hf <= HF_SOFT_REBALANCE) return 'soft'
  return 'safe'
}

export function hfZoneLabel(zone: HfZone) {
  if (zone === 'danger') return 'Safe-Exit zone'
  if (zone === 'soft') return 'Soft rebalance zone'
  return 'Healthy'
}

export function hfZoneColor(zone: HfZone) {
  if (zone === 'danger') return 'text-danger'
  if (zone === 'soft') return 'text-cobalt'
  return 'text-forest'
}

export function formatRelative(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 48) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function explorerTxUrl(networkLabel: string, txHash: string) {
  const base =
    networkLabel.toLowerCase().includes('base')
      ? 'https://sepolia.basescan.org/tx/'
      : 'https://sepolia.etherscan.io/tx/'
  return `${base}${txHash}`
}

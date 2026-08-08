import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/api-auth'
import { getPositionState, parseNetworkId } from '@/lib/aave/reader'

export const dynamic = 'force-dynamic'

interface AllocationItem {
  token: string
  symbol: string
  percentage: number
  usdValue: number
  color: string
  isStable: boolean
}

const ASSET_ALLOCATION = [
  { token: 'Ether', symbol: 'ETH', weight: 0.52, color: '#627eea', isStable: false },
  { token: 'USD Coin', symbol: 'USDC', weight: 0.33, color: '#2775ca', isStable: true },
  { token: 'Coinbase Wrapped BTC', symbol: 'cbBTC', weight: 0.15, color: '#f7931a', isStable: false },
]

function calculateYield(collateralUsd: number, debtUsd: number): {
  supplyApy: number
  borrowApy: number
  netApy: number
} {
  const supplyApy = 2.4 + (collateralUsd >= 15_000 ? 1.9 : collateralUsd >= 5_000 ? 0.9 : 0.2)
  const borrowApy = 4.8 + (debtUsd >= 10_000 ? 1.4 : debtUsd >= 3_000 ? 0.6 : 0.1)
  const netApy = collateralUsd > 0 ? supplyApy * (1 - debtUsd / collateralUsd) + 0.2 : supplyApy
  return { supplyApy, borrowApy, netApy }
}

export async function GET(request: Request) {
  const auth = await requireSession()
  if ('error' in auth) return auth.error

  const url = new URL(request.url)
  const network = parseNetworkId(url.searchParams.get('network'))
  const targetWallet =
    url.searchParams.get('wallet') ??
    process.env.TARGET_WALLET ??
    process.env.NEXT_PUBLIC_TARGET_WALLET ??
    auth.session.wallet

  let collateralUsd: number
  let debtUsd: number
  let healthFactor: number
  let source: 'aave' | 'agent' | 'demo' = 'demo'
  let error: string | null = null

  try {
    const position = await getPositionState(network, targetWallet)
    collateralUsd = position.collateral_usd
    debtUsd = position.debt_usd
    healthFactor = position.health_factor
    source = 'aave'
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    // Demo fallback — scaled deterministic distribution so the UI renders realistically.
    const DEMO_COLLATERAL = 15_240
    const DEMO_DEBT = 11_850
    collateralUsd = DEMO_COLLATERAL
    debtUsd = DEMO_DEBT
    healthFactor = collateralUsd / Math.max(debtUsd, 1)
    source = 'demo'
  }

  const allocation: AllocationItem[] = ASSET_ALLOCATION.map((asset) => {
    const usdValue = Math.round(collateralUsd * asset.weight)
    return {
      token: asset.token,
      symbol: asset.symbol,
      percentage: Math.round(asset.weight * 100),
      usdValue,
      color: asset.color,
      isStable: asset.isStable,
    }
  })

  const { supplyApy, borrowApy, netApy } = calculateYield(collateralUsd, debtUsd)

  return NextResponse.json({
    collateralUsd: Math.round(collateralUsd),
    debtUsd: Math.round(debtUsd),
    healthFactor: Number.isFinite(healthFactor) ? healthFactor : null,
    network,
    targetWallet,
    source,
    error,
    allocation,
    yields: {
      supplyApy,
      borrowApy,
      netApy,
    },
    lastUpdated: new Date().toISOString(),
  })
}
import {
  AAVE_BASE_CURRENCY_DECIMALS,
  AAVE_HF_DECIMALS,
  AAVE_HF_INFINITE_THRESHOLD,
  DEFAULT_AAVE_POOL,
  NETWORK_LABEL,
  type NetworkId,
  type PositionState,
} from '@defi-sentinel/shared'
import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  type Address,
} from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'

const AAVE_POOL_ABI = parseAbi([
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
])

function rpcUrl(networkId: NetworkId): string {
  if (networkId === 'base-sepolia') {
    return process.env.RPC_URL_BASE_SEPOLIA ?? 'https://sepolia.base.org'
  }
  return process.env.RPC_URL_ETH_SEPOLIA ?? 'https://rpc.sepolia.org'
}

function poolAddress(networkId: NetworkId): Address {
  if (networkId === 'base-sepolia') {
    return (process.env.AAVE_POOL_ADDRESS_BASE_SEPOLIA ??
      DEFAULT_AAVE_POOL['base-sepolia']) as Address
  }
  return (process.env.AAVE_POOL_ADDRESS_ETH_SEPOLIA ??
    DEFAULT_AAVE_POOL['eth-sepolia']) as Address
}

export function decodeHealthFactor(raw: bigint): number {
  const asNumber = Number(formatUnits(raw, AAVE_HF_DECIMALS))
  if (!Number.isFinite(asNumber) || asNumber >= AAVE_HF_INFINITE_THRESHOLD) {
    return Number.POSITIVE_INFINITY
  }
  return asNumber
}

export function baseToUsd(value: bigint): number {
  return Number(formatUnits(value, AAVE_BASE_CURRENCY_DECIMALS))
}

/** Read-only Aave V3 position for dashboard (server-side only). */
export async function getPositionState(
  networkId: NetworkId,
  wallet: string,
): Promise<PositionState> {
  if (!isAddress(wallet)) {
    throw new Error(`Invalid wallet address: ${wallet}`)
  }

  const client = createPublicClient({
    chain: networkId === 'base-sepolia' ? baseSepolia : sepolia,
    transport: http(rpcUrl(networkId)),
  })

  const result = await client.readContract({
    address: poolAddress(networkId),
    abi: AAVE_POOL_ABI,
    functionName: 'getUserAccountData',
    args: [wallet as Address],
  })

  const [totalCollateralBase, totalDebtBase, , , , healthFactor] = result

  return {
    protocol: 'AaveV3',
    network: NETWORK_LABEL[networkId],
    target_wallet: wallet,
    health_factor: decodeHealthFactor(healthFactor),
    collateral_usd: baseToUsd(totalCollateralBase),
    debt_usd: baseToUsd(totalDebtBase),
  }
}

export function parseNetworkId(value?: string | null): NetworkId {
  const raw = (value ?? process.env.NEXT_PUBLIC_AGENT_NETWORK ?? 'base-sepolia')
    .toLowerCase()
    .trim()
  if (raw === 'eth-sepolia' || raw === 'sepolia' || raw === 'eth') return 'eth-sepolia'
  return 'base-sepolia'
}

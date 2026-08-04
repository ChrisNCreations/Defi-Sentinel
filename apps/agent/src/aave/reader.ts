import {
  AAVE_BASE_CURRENCY_DECIMALS,
  AAVE_HF_DECIMALS,
  AAVE_HF_INFINITE_THRESHOLD,
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
import { getNetworkConfig, type NetworkConfig } from '../config'

const AAVE_POOL_ABI = parseAbi([
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
])

const chainByNetwork = {
  'base-sepolia': baseSepolia,
  'eth-sepolia': sepolia,
} as const

function createClient(config: NetworkConfig) {
  return createPublicClient({
    chain: chainByNetwork[config.id],
    transport: http(config.rpcUrl),
  })
}

/** Convert Aave base-currency units (8 decimals) to USD float. */
export function baseToUsd(value: bigint): number {
  return Number(formatUnits(value, AAVE_BASE_CURRENCY_DECIMALS))
}

/** Convert on-chain HF ray (1e18) to float; max-uint-ish → Infinity. */
export function decodeHealthFactor(raw: bigint): number {
  // Aave uses type(uint256).max when user has no debt
  const asNumber = Number(formatUnits(raw, AAVE_HF_DECIMALS))
  if (!Number.isFinite(asNumber) || asNumber >= AAVE_HF_INFINITE_THRESHOLD) {
    return Number.POSITIVE_INFINITY
  }
  return asNumber
}

export interface RawUserAccountData {
  totalCollateralBase: bigint
  totalDebtBase: bigint
  availableBorrowsBase: bigint
  currentLiquidationThreshold: bigint
  ltv: bigint
  healthFactor: bigint
}

export async function fetchUserAccountData(
  networkId: NetworkId,
  wallet: Address,
  config = getNetworkConfig(networkId),
): Promise<RawUserAccountData> {
  if (!isAddress(wallet)) {
    throw new Error(`Invalid wallet address: ${wallet}`)
  }

  const client = createClient(config)
  const result = await client.readContract({
    address: config.poolAddress,
    abi: AAVE_POOL_ABI,
    functionName: 'getUserAccountData',
    args: [wallet],
  })

  const [
    totalCollateralBase,
    totalDebtBase,
    availableBorrowsBase,
    currentLiquidationThreshold,
    ltv,
    healthFactor,
  ] = result

  return {
    totalCollateralBase,
    totalDebtBase,
    availableBorrowsBase,
    currentLiquidationThreshold,
    ltv,
    healthFactor,
  }
}

export async function getPositionState(
  networkId: NetworkId,
  wallet: Address,
  config = getNetworkConfig(networkId),
): Promise<PositionState> {
  const raw = await fetchUserAccountData(networkId, wallet, config)

  return {
    protocol: 'AaveV3',
    network: NETWORK_LABEL[networkId],
    target_wallet: wallet,
    health_factor: decodeHealthFactor(raw.healthFactor),
    collateral_usd: baseToUsd(raw.totalCollateralBase),
    debt_usd: baseToUsd(raw.totalDebtBase),
  }
}

/** Health-factor thresholds (raw number after dividing on-chain value by 1e18) */
export const HF_SOFT_REBALANCE = 1.3
export const HF_SAFE_EXIT = 1.1

/** Soft rebalance targets ~20% of current debt */
export const SOFT_REBALANCE_REPAY_PCT = 20

/** Aave close-factor awareness (large positions) */
export const AAVE_CLOSE_FACTOR_PCT = 50

/** Aave base currency uses 8 decimals for USD-denominated account data */
export const AAVE_BASE_CURRENCY_DECIMALS = 8

/** Health factor is returned with 18 decimals (ray) */
export const AAVE_HF_DECIMALS = 18

/**
 * When a wallet has no debt, Aave returns max uint256 for health factor.
 * Treat anything at/above this as "infinite" (no liquidation risk from debt).
 */
export const AAVE_HF_INFINITE_THRESHOLD = 1e10

export type ActionType = 'NONE' | 'SOFT_REBALANCE' | 'SAFE_EXIT'

export type Action =
  | { type: 'NONE' }
  | { type: 'SOFT_REBALANCE'; repayPct: typeof SOFT_REBALANCE_REPAY_PCT }
  | { type: 'SAFE_EXIT' }

export type NetworkId = 'base-sepolia' | 'eth-sepolia'

export type NetworkName = 'Base Sepolia' | 'Ethereum Sepolia'

export const NETWORK_LABEL: Record<NetworkId, NetworkName> = {
  'base-sepolia': 'Base Sepolia',
  'eth-sepolia': 'Ethereum Sepolia',
}

/**
 * Default Aave V3 Pool proxies (override via env in the agent).
 * Sources: Aave address book / market deployments (testnet).
 */
export const DEFAULT_AAVE_POOL: Record<NetworkId, `0x${string}`> = {
  'base-sepolia': '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
  'eth-sepolia': '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
}

export interface PositionState {
  protocol: 'AaveV3'
  network: NetworkName
  target_wallet: string
  health_factor: number
  collateral_usd: number
  debt_usd: number
}

export interface DecisionResult {
  action: Action
  position: PositionState
  reason: string
}

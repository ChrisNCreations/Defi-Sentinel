export * from './roles'
export * from './aave'
export * from './audit-schema'

/** Product constants */
export const PRODUCT_NAME = 'DeFi Sentinel'
export const PRODUCT_TAGLINE = 'Autonomous Treasury Rebalancer & Yield Sentinel'
export const POLL_INTERVAL_HOURS = 6

export const DEFAULT_HARD_LIMITS = {
  max_repayment_pct: 30,
  max_gas_price_gwei: 50,
  max_consecutive_failures: 3,
} as const

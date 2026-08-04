import { SiweMessage } from 'siwe'

/**
 * Browser-safe SIWE message builder (no Node crypto).
 */
export function buildSiweMessage(params: {
  address: string
  chainId: number
  nonce: string
}): SiweMessage {
  const domain =
    typeof window !== 'undefined' ? window.location.host : 'localhost:3000'
  const uri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'

  return new SiweMessage({
    domain,
    address: params.address,
    statement: 'Sign in to DeFi Sentinel with your Ethereum wallet.',
    uri,
    version: '1',
    chainId: params.chainId,
    nonce: params.nonce,
    issuedAt: new Date().toISOString(),
  })
}

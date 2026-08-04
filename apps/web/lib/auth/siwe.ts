import { createHmac, randomBytes } from 'crypto'
import { SiweMessage } from 'siwe'

export const SIWE_DOMAIN =
  process.env.NEXT_PUBLIC_SIWE_DOMAIN ?? process.env.VERCEL_URL ?? 'localhost:3000'

export const SIWE_URI = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export function normalizeWallet(address: string): string {
  return address.toLowerCase()
}

export function walletAuthEmail(wallet: string): string {
  return `${normalizeWallet(wallet)}@wallet.defi-sentinel.local`
}

/** Deterministic password derived after SIWE success (server-only secret). */
export function walletAuthPassword(wallet: string): string {
  const secret = process.env.AUTH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('AUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY required for SIWE session minting')
  }
  return createHmac('sha256', secret).update(`siwe:${normalizeWallet(wallet)}`).digest('hex')
}

export function createNonce(): string {
  return randomBytes(16).toString('hex')
}

export function buildSiweMessage(params: {
  address: string
  chainId: number
  nonce: string
  issuedAt?: string
}): SiweMessage {
  return new SiweMessage({
    domain: SIWE_DOMAIN.replace(/^https?:\/\//, ''),
    address: params.address,
    statement: 'Sign in to DeFi Sentinel with your Ethereum wallet.',
    uri: SIWE_URI,
    version: '1',
    chainId: params.chainId,
    nonce: params.nonce,
    issuedAt: params.issuedAt ?? new Date().toISOString(),
  })
}

export async function verifySiweMessage(
  message: string,
  signature: string,
): Promise<{ address: string; chainId: number }> {
  const siwe = new SiweMessage(message)
  const result = await siwe.verify({ signature })

  if (!result.success || !result.data) {
    throw new Error(result.error?.type ?? 'SIWE_VERIFICATION_FAILED')
  }

  return {
    address: normalizeWallet(result.data.address),
    chainId: result.data.chainId,
  }
}

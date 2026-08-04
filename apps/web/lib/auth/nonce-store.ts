import { normalizeWallet } from '@/lib/auth/siwe'

const globalForNonce = globalThis as unknown as {
  siweNonces?: Map<string, { nonce: string; exp: number }>
}

function store() {
  if (!globalForNonce.siweNonces) {
    globalForNonce.siweNonces = new Map()
  }
  return globalForNonce.siweNonces
}

export function saveNonce(address: string, nonce: string, ttlMs = 10 * 60 * 1000) {
  store().set(normalizeWallet(address), {
    nonce,
    exp: Date.now() + ttlMs,
  })
}

export function consumeNonce(address: string, nonce: string): boolean {
  const key = normalizeWallet(address)
  const entry = store().get(key)
  if (!entry) return false
  if (entry.exp < Date.now()) {
    store().delete(key)
    return false
  }
  if (entry.nonce !== nonce) return false
  store().delete(key)
  return true
}

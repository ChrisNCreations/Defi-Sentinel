import { NextResponse } from 'next/server'
import { createNonce, normalizeWallet } from '@/lib/auth/siwe'
import { saveNonce } from '@/lib/auth/nonce-store'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'INVALID_ADDRESS' }, { status: 400 })
  }

  const nonce = createNonce()
  saveNonce(normalizeWallet(address), nonce)

  return NextResponse.json({ nonce })
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId, useSignMessage } from 'wagmi'
import { getAddress } from 'viem'
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@defi-sentinel/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { buildSiweMessage } from '@/lib/auth/siwe-client'

type Status = 'idle' | 'signing' | 'verifying' | 'success' | 'error'

export function LoginCard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { signMessageAsync } = useSignMessage()

  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const urlError = searchParams.get('error')

  const signIn = useCallback(async () => {
    if (!address) return
    setError(null)
    setStatus('signing')

    try {
      const nonceRes = await fetch(`/api/auth/nonce?address=${address}`)
      if (!nonceRes.ok) {
        throw new Error('Failed to fetch SIWE nonce')
      }
      const { nonce } = (await nonceRes.json()) as { nonce: string }

      const message = buildSiweMessage({
        address: getAddress(address),
        chainId,
        nonce,
      })
      const prepared = message.prepareMessage()
      const signature = await signMessageAsync({ message: prepared })

      setStatus('verifying')
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prepared, signature }),
      })

      const payload = (await verifyRes.json()) as {
        ok?: boolean
        redirectTo?: string
        error?: string
        message?: string
      }

      if (!verifyRes.ok) {
        if (payload.error === 'ACCESS_DENIED') {
          throw new Error(
            payload.message ?? 'Access denied — wallet is not in the organization.',
          )
        }
        throw new Error(payload.message ?? payload.error ?? 'Sign-in failed')
      }

      setStatus('success')
      const next = searchParams.get('next')
      router.replace(next && next.startsWith('/') ? next : payload.redirectTo ?? '/dashboard')
      router.refresh()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    }
  }, [address, chainId, router, searchParams, signMessageAsync])

  // Auto-prompt SIWE once connected
  useEffect(() => {
    if (isConnected && address && status === 'idle') {
      // wait a tick so RainbowKit finishes
      const t = setTimeout(() => {
        void signIn()
      }, 400)
      return () => clearTimeout(t)
    }
  }, [isConnected, address, status, signIn])

  return (
    <>
      <div className="relative z-10 mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cobalt text-lg font-semibold text-white shadow-soft">
          DS
        </div>
        <h1 className="text-2xl font-semibold text-ink">{PRODUCT_NAME}</h1>
        <p className="mt-1 max-w-sm text-sm text-slate">{PRODUCT_TAGLINE}</p>
      </div>

      <Card className="relative z-10 w-full max-w-[420px] border-0 shadow-subtle">
        <CardContent className="p-8">
          <p className="text-center text-base text-ink">Connect your wallet to continue</p>
          <p className="mt-2 text-center text-sm text-slate">
            Sign-In with Ethereum issues a session JWT and loads your role.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />

            {isConnected && (
              <Button
                type="button"
                className="w-full"
                disabled={status === 'signing' || status === 'verifying' || status === 'success'}
                onClick={() => {
                  setStatus('idle')
                  void signIn()
                }}
              >
                {status === 'signing' && 'Check wallet to sign…'}
                {status === 'verifying' && 'Verifying signature…'}
                {status === 'success' && 'Redirecting…'}
                {(status === 'idle' || status === 'error') && 'Sign in with Ethereum'}
              </Button>
            )}
          </div>

          {(error || urlError) && (
            <p className="mt-6 rounded-badge bg-danger/10 px-3 py-2 text-center text-sm text-danger">
              {error ??
                (urlError === 'access_denied'
                  ? 'Access denied — wallet is not an organization member.'
                  : urlError === 'no_profile'
                    ? 'Profile missing — please sign in again.'
                    : 'Authentication error.')}
            </p>
          )}

          <p className="mt-6 text-center text-xs text-steel">
            Seeded test wallets: Admin (Anvil #0), Operator (#1), Viewer (#2).
          </p>
        </CardContent>
      </Card>

      <p className="relative z-10 mt-8 text-center text-sm text-slate">
        Supported: Base Sepolia / Ethereum Sepolia
      </p>
    </>
  )
}

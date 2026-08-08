'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId, useSignMessage } from 'wagmi'
import { getAddress } from 'viem'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SentinelLogo } from '@/components/layout/sentinel-logo'
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
      const t = setTimeout(() => {
        void signIn()
      }, 400)
      return () => clearTimeout(t)
    }
  }, [isConnected, address, status, signIn])

  return (
    <Card className="border-0 shadow-subtle">
      <CardContent className="space-y-6 p-8">
        {/* Brand mark */}
        <div className="flex justify-center">
          <SentinelLogo className="h-16 w-16" />
        </div>

        {/* Title */}
        <div className="text-center">
          <p className="text-xl font-semibold text-ink">Secure wallet sign-in</p>
          <p className="mt-2 text-sm text-slate">Choose your preferred wallet to continue</p>
        </div>

        {/* Connect button */}
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />

        {/* Sign in button */}
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

        {/* Error message */}
        {(error || urlError) && (
          <p className="rounded-badge bg-danger/10 px-3 py-2 text-center text-sm text-danger">
            {error ??
              (urlError === 'access_denied'
                ? 'Could not complete sign-in. Try connecting again.'
                : urlError === 'no_profile'
                  ? 'Profile missing — please sign in again.'
                  : 'Authentication error.')}
          </p>
        )}

        {/* Security note */}
        <div className="flex items-start gap-3 rounded-card border border-hairline bg-ivory p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cobalt" />
          <p className="text-xs text-slate">
            You will be asked to sign a message to verify ownership and continue securely.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

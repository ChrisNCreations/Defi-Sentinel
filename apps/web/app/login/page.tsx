import { Suspense } from 'react'
import { LoginHero } from '@/components/auth/login-hero'
import { LoginCard } from '@/components/auth/login-card'
import { LoginTrustBadges } from '@/components/auth/login-trust-badges'
import { LoginFooter } from '@/components/auth/login-footer'
import { SentinelWordmark } from '@/components/layout/sentinel-logo'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left: Dark hero panel */}
      <div className="hidden w-1/2 lg:block">
        <LoginHero />
      </div>

      {/* Right: Light card panel */}
      <div className="flex w-full flex-col items-center justify-center bg-canvas px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center gap-4 lg:hidden">
            <SentinelWordmark />
          </div>

          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold text-ink">Welcome back</h1>
            <p className="mt-2 text-sm text-slate">
              Connect your wallet to continue to your dashboard
            </p>
          </div>

          <Suspense fallback={<p className="text-sm text-slate">Loading…</p>}>
            <LoginCard />
          </Suspense>

          <div className="mt-6">
            <LoginTrustBadges />
          </div>
          <LoginFooter />
        </div>
      </div>
    </div>
  )
}

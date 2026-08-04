import { Suspense } from 'react'
import { LoginCard } from '@/components/auth/login-card'

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-powder/40 to-transparent"
      />
      <Suspense fallback={<p className="text-sm text-slate">Loading…</p>}>
        <LoginCard />
      </Suspense>
    </main>
  )
}

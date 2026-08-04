import Link from 'next/link'
import { HF_SAFE_EXIT, HF_SOFT_REBALANCE, PRODUCT_NAME, PRODUCT_TAGLINE } from '@defi-sentinel/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getSessionAndRole, roleHomePath } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  try {
    const session = await getSessionAndRole()
    if (session) {
      redirect(roleHomePath(session.role))
    }
  } catch {
    // Missing Supabase env in local scaffold — still render landing
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <Card className="w-full max-w-lg border-0 p-4 shadow-subtle sm:p-6">
        <CardHeader className="px-4 sm:px-2">
          <p className="text-sm font-medium text-cobalt">Phase 0–2 ready · Phase 1 auth</p>
          <CardTitle className="mt-2 text-3xl tracking-tight">{PRODUCT_NAME}</CardTitle>
          <CardDescription className="text-base">{PRODUCT_TAGLINE}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 px-4 sm:px-2">
          <ul className="space-y-2 text-sm text-slate">
            <li>
              Soft rebalance when HF ≤ <span className="font-medium text-ink">{HF_SOFT_REBALANCE}</span>
            </li>
            <li>
              Safe-exit when HF ≤ <span className="font-medium text-ink">{HF_SAFE_EXIT}</span>
            </li>
            <li>SIWE login · roles · RLS-protected dashboards</li>
          </ul>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/login">Connect Wallet</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

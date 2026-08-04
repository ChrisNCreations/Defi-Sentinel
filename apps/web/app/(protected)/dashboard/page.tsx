import { HF_SAFE_EXIT, HF_SOFT_REBALANCE } from '@defi-sentinel/shared'
import { getSessionAndRole } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const session = await getSessionAndRole()
  const canAct = session?.role === 'admin' || session?.role === 'operator'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-slate">
          Autonomous Treasury Rebalancer &amp; Yield Sentinel
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-0 shadow-subtle">
          <CardHeader>
            <CardTitle>Health Factor</CardTitle>
            <CardDescription>Live position data arrives with agent status APIs (Phase 7).</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-5xl font-semibold tabular-nums text-forest">—</p>
            <p className="mt-3 text-sm text-slate">
              Soft rebalance ≤ {HF_SOFT_REBALANCE} · Safe-exit ≤ {HF_SAFE_EXIT}
            </p>
            <p className="mt-4 rounded-badge bg-lavender/60 px-3 py-2 text-sm text-ink">
              Signed in as <span className="font-medium">{session?.role}</span>
              {session ? ` · ${session.wallet.slice(0, 6)}…${session.wallet.slice(-4)}` : null}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-subtle">
          <CardHeader>
            <CardTitle>Ask Sentinel</CardTitle>
            <CardDescription>
              {canAct
                ? 'Natural-language commands land in Phase 5 (Gemini).'
                : 'Viewers can monitor status only.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-card border border-hairline bg-ivory px-4 py-3 text-sm text-steel">
              e.g. Should I rebalance now?
            </div>
            <p className="text-xs text-slate">
              Force Soft / Safe-Exit actions are gated to operators &amp; admins
              {canAct ? ' (you have access — execution in Phase 4).' : '.'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {['Collateral', 'Debt', 'Next poll'].map((label) => (
          <Card key={label} className="border-0 shadow-subtle">
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate">{label}</p>
              <p className="mt-2 text-xl font-semibold text-ink">—</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

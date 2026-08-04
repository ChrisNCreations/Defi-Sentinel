import { getSessionAndRole } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const session = await getSessionAndRole()
  if (!session || session.role !== 'admin') {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const { data: limits } = await supabase
    .from('hard_limits')
    .select('max_repayment_pct, max_gas_price_gwei, max_consecutive_failures, updated_at')
    .eq('organization_id', session.organizationId)
    .maybeSingle()

  const { data: breaker } = await supabase
    .from('circuit_breaker')
    .select('is_tripped, failure_count, last_failure_reason')
    .eq('organization_id', session.organizationId)
    .maybeSingle()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Admin</h1>
        <p className="mt-1 text-sm text-slate">Hard limits, circuit breaker, and org settings.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-0 shadow-subtle">
          <CardHeader>
            <CardTitle>Hard limits</CardTitle>
            <CardDescription>Cannot be overridden by Gemini or Operators.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Max repayment %" value={limits?.max_repayment_pct ?? '—'} />
            <Row label="Max gas (gwei)" value={limits?.max_gas_price_gwei ?? '—'} />
            <Row label="Max consecutive failures" value={limits?.max_consecutive_failures ?? '—'} />
          </CardContent>
        </Card>

        <Card className="border-0 shadow-subtle">
          <CardHeader>
            <CardTitle>Circuit breaker</CardTitle>
            <CardDescription>Trips after repeated failures (Phase 3).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="Status"
              value={breaker?.is_tripped ? 'Tripped' : 'Clear'}
            />
            <Row label="Failure count" value={breaker?.failure_count ?? 0} />
            <Row label="Last reason" value={breaker?.last_failure_reason ?? '—'} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-hairline py-2 last:border-0">
      <span className="text-slate">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  )
}

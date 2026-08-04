import { getSessionAndRole, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AuditPage() {
  const session = await getSessionAndRole()
  if (!session || (session.role !== 'admin' && session.role !== 'operator')) {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('audit_logs')
    .select('id, timestamp, trigger_type, actor_wallet, guardrail_validation, execution_details')
    .eq('organization_id', session.organizationId)
    .order('timestamp', { ascending: false })
    .limit(25)

  // Viewers would get empty/error via RLS; we already blocked them above
  const logs = rows ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Audit Trail</h1>
        <p className="mt-1 text-sm text-slate">
          Append-only history. Viewers cannot read this table (RLS).
        </p>
      </div>

      <Card className="border-0 shadow-subtle">
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>
            {error
              ? `Query error: ${error.message}`
              : logs.length === 0
                ? 'No audit rows yet — agent cycles will populate this (Phase 3+).'
                : `${logs.length} most recent rows`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-slate">Empty audit log for this organization.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-hairline text-xs uppercase text-slate">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Time</th>
                    <th className="py-2 pr-4 font-medium">Trigger</th>
                    <th className="py-2 pr-4 font-medium">Actor</th>
                    <th className="py-2 font-medium">Guardrail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id} className="border-b border-hairline/80">
                      <td className="py-3 pr-4 text-ink">
                        {new Date(row.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 text-slate">{row.trigger_type}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-ink">
                        {row.actor_wallet
                          ? `${row.actor_wallet.slice(0, 6)}…${row.actor_wallet.slice(-4)}`
                          : '—'}
                      </td>
                      <td className="py-3 text-slate">
                        {(row.guardrail_validation as { status?: string } | null)?.status ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

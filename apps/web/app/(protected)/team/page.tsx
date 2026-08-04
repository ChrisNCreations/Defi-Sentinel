import { getSessionAndRole, createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function TeamPage() {
  const session = await getSessionAndRole()
  if (!session || session.role !== 'admin') {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const { data: members } = await supabase
    .from('organization_members')
    .select('wallet_address, role, created_at')
    .eq('organization_id', session.organizationId)
    .order('created_at', { ascending: true })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Team</h1>
        <p className="mt-1 text-sm text-slate">Organization members and roles.</p>
      </div>

      <Card className="border-0 shadow-subtle">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Seeded Admin / Operator / Viewer wallets. Manage via SQL or future admin form.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-hairline text-xs uppercase text-slate">
              <tr>
                <th className="py-2 pr-4 font-medium">Wallet</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.wallet_address} className="border-b border-hairline/80">
                  <td className="py-3 pr-4 font-mono text-xs text-ink">{m.wallet_address}</td>
                  <td className="py-3 pr-4 capitalize text-ink">{m.role}</td>
                  <td className="py-3 text-slate">
                    {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

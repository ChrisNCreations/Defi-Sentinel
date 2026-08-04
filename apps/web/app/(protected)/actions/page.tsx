import { getSessionAndRole } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function ActionsPage() {
  const session = await getSessionAndRole()
  if (!session || (session.role !== 'admin' && session.role !== 'operator')) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Operator Console</h1>
        <p className="mt-1 text-sm text-slate">Manual actions — execution path in Phase 4.</p>
      </div>

      <Card className="border-0 shadow-subtle">
        <CardHeader>
          <CardTitle>Natural language command</CardTitle>
          <CardDescription>Gemini intent parsing lands in Phase 5.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="min-h-[96px] rounded-card border border-hairline bg-ivory px-4 py-3 text-sm text-steel">
            Check health and repay 20% if needed…
          </div>
          <Button disabled>Send to Agent</Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button disabled variant="secondary">
          Force Soft Rebalance
        </Button>
        <Button disabled variant="outline">
          Force Safe-Exit
        </Button>
      </div>
    </div>
  )
}

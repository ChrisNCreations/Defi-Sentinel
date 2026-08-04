import { redirect } from 'next/navigation'
import { getSessionAndRole } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/app-shell'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionAndRole()
  if (!session) {
    redirect('/login')
  }

  return (
    <AppShell wallet={session.wallet} role={session.role}>
      {children}
    </AppShell>
  )
}

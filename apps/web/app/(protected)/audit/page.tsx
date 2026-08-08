import { getSessionAndRole } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AuditClient } from '@/components/audit/audit-client'

export default async function AuditPage() {
  const session = await getSessionAndRole()
  if (!session || (session.role !== 'admin' && session.role !== 'operator')) {
    redirect('/dashboard')
  }

  return <AuditClient />
}

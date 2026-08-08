import { getSessionAndRole } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ActionsClient } from '@/components/actions/actions-client'

export default async function ActionsPage() {
  const session = await getSessionAndRole()
  if (!session || (session.role !== 'admin' && session.role !== 'operator')) {
    redirect('/dashboard')
  }

  return <ActionsClient />
}

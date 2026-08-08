import { getSessionAndRole } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminClient } from '@/components/admin/admin-client'

export default async function AdminPage() {
  const session = await getSessionAndRole()
  if (!session || session.role !== 'admin') {
    redirect('/dashboard')
  }

  return <AdminClient />
}

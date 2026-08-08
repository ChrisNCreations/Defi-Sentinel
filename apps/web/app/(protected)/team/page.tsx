import { getSessionAndRole } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamClient } from '@/components/team/team-client'

export default async function TeamPage() {
  const session = await getSessionAndRole()
  if (!session) redirect('/login')

  return <TeamClient />
}

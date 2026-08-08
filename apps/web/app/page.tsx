import { redirect } from 'next/navigation'
import { getSessionAndRole, roleHomePath } from '@/lib/supabase/server'

export default async function HomePage() {
  const session = await getSessionAndRole()
  if (session) {
    redirect(roleHomePath(session.role))
  }
  redirect('/login')
}

import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/supabase/server'

export async function GET() {
  const session = await getSessionAndRole()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  }
  return NextResponse.json(session)
}

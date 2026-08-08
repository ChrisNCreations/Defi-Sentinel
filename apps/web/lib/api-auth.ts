import { NextResponse } from 'next/server'
import type { Role } from '@defi-sentinel/shared'
import { getSessionAndRole, type SessionAndRole } from '@/lib/supabase/server'

export async function requireSession(
  roles?: Role[],
): Promise<{ session: SessionAndRole } | { error: NextResponse }> {
  const session = await getSessionAndRole()
  if (!session) {
    return { error: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) }
  }
  if (roles && !roles.includes(session.role)) {
    return { error: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }) }
  }
  return { session }
}

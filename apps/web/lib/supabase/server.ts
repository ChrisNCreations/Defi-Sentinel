import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Role } from '@defi-sentinel/shared'
import { resolveMembershipForWallet } from '@/lib/supabase/membership'

export async function createClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Called from a Server Component — middleware will refresh sessions.
        }
      },
    },
  })
}

export interface SessionAndRole {
  userId: string
  wallet: string
  role: Role
  organizationId: string
  displayName: string | null
}

/**
 * Resolve authenticated user → profile wallet → organization membership role.
 * Returns null when unauthenticated or not a member of any org.
 * Membership is resolved via service role (avoids recursive RLS on org_members).
 */
export async function getSessionAndRole(): Promise<SessionAndRole | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('wallet_address, display_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.wallet_address) return null

  const membership = await resolveMembershipForWallet(profile.wallet_address)
  if (!membership) return null

  return {
    userId: user.id,
    wallet: profile.wallet_address,
    role: membership.role,
    organizationId: membership.organization_id,
    displayName: profile.display_name,
  }
}

/** Role-based default landing path after login */
export function roleHomePath(role: Role): string {
  if (role === 'admin') return '/admin'
  return '/dashboard'
}

export function canAccessPath(role: Role, pathname: string): boolean {
  if (pathname.startsWith('/admin')) {
    return role === 'admin'
  }
  if (pathname.startsWith('/team')) {
    return true
  }
  if (pathname.startsWith('/audit') || pathname.startsWith('/actions')) {
    return role === 'admin' || role === 'operator'
  }
  // dashboard and other protected routes
  return true
}

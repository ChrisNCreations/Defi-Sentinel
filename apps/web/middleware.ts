import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Role } from '@defi-sentinel/shared'

const PROTECTED_PREFIXES = ['/dashboard', '/actions', '/audit', '/admin', '/team']

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function canAccess(role: Role, pathname: string): boolean {
  if (pathname.startsWith('/admin') || pathname.startsWith('/team')) {
    return role === 'admin'
  }
  if (pathname.startsWith('/audit') || pathname.startsWith('/actions')) {
    return role === 'admin' || role === 'operator'
  }
  return true
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const { pathname } = request.nextUrl

  if (!url || !key) {
    // Allow pages to render; auth APIs will error clearly
    return response
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Login page: send authenticated members home
  if (pathname === '/login' && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_address')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.wallet_address) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('wallet_address', profile.wallet_address)
        .maybeSingle()

      if (membership?.role) {
        const dest = membership.role === 'admin' ? '/admin' : '/dashboard'
        return NextResponse.redirect(new URL(dest, request.url))
      }
    }
  }

  if (isProtected(pathname)) {
    if (!user) {
      const login = new URL('/login', request.url)
      login.searchParams.set('next', pathname)
      return NextResponse.redirect(login)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_address')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.wallet_address) {
      return NextResponse.redirect(new URL('/login?error=no_profile', request.url))
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('wallet_address', profile.wallet_address)
      .maybeSingle()

    if (!membership?.role) {
      return NextResponse.redirect(new URL('/login?error=access_denied', request.url))
    }

    const role = membership.role as Role
    if (!canAccess(role, pathname)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/login',
    '/dashboard/:path*',
    '/actions/:path*',
    '/audit/:path*',
    '/admin/:path*',
    '/team/:path*',
  ],
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Middleware для проверки auth-сессии Supabase.
 * Публичные роуты (/login, /register, /auth/callback) — пропускаются.
 * Приватные — проверяют наличие сессии, редиректят на /login.
 */

const publicPaths = ['/login', '/register', '/auth/callback', '/lawyers', '/blog', '/about', '/privacy', '/terms']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Публичные пути — пропускаем
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Статика и API — пропускаем
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next()
  }

  // Проверяем Supabase сессию через cookies
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Если нет пользователя и не публичный путь — редирект на login
  if (!user && !publicPaths.some((p) => pathname.startsWith(p))) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

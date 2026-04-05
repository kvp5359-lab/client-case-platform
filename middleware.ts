import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Middleware для проверки auth-сессии Supabase.
 * Публичные роуты (/login, /register, /auth/callback) — пропускаются.
 * Приватные — проверяют наличие сессии, редиректят на /login.
 */

const publicPaths = [
  '/',
  '/login',
  '/register',
  '/auth/callback',
  '/lawyers',
  '/blog',
  '/about',
  '/privacy',
  '/terms',
]

function isPublicPath(pathname: string): boolean {
  // Точное совпадение либо начало с разделителем, чтобы /loginabc не матчился под /login
  return publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Публичные пути — пропускаем
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // API, статика, файлы с расширением — пропускаем
  // (API заглушки; когда появятся реальные — проверку auth добавлять внутри handler)
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next()
  }

  // Проверяем Supabase сессию через cookies
  const response = NextResponse.next({
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

  // getSession() читает куку без запроса к Supabase — быстрее getUser() на 100-300мс.
  // Это middleware-защита от неавторизованных; реальную валидацию токена делает Supabase
  // при каждом запросе к БД через RLS, так что здесь getSession достаточно.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Исключаем _next/static, _next/image, _next/data, favicon, robots, sitemap, manifest,
    // и любые файлы с точкой (шрифты, иконки и т.п.) — они обрабатываются напрямую Next.js.
    '/((?!_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml|manifest.json|.*\\.[^/]+$).*)',
  ],
}

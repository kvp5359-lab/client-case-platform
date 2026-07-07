import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  resolveWorkspaceByHost,
  getWorkspaceById,
  getShortIdByUuid,
  resolveShortId,
} from '@/lib/middleware/resolvers'

/**
 * Middleware: auth + резолв воркспейса по host (поддомен / custom-домен).
 *
 * Архитектура:
 * - my.clientcase.app    — портал (login/register/select-workspace), без воркспейса
 * - <slug>.clientcase.app — воркспейс через поддомен (rewrite на /workspaces/<uuid>/...)
 * - <custom_domain>      — воркспейс через custom-домен клиента (то же самое)
 * - clientcase.app       — корень, редиректит на my.clientcase.app
 * - clientcase.kvp-projects.com и прочие — legacy режим, /workspaces/<uuid>/... напрямую
 *
 * Cookies авторизации на поддоменах clientcase.app — расшарены через Domain=.clientcase.app.
 *
 * См. docs/feature-backlog/2026-05-04-subdomain-per-workspace-routing.md
 */

const ROOT_DOMAIN = 'clientcase.app'
const PORTAL_HOST = `my.${ROOT_DOMAIN}`

// Системные поддомены — не воркспейсы
const SYSTEM_SUBDOMAINS = new Set([
  'my', 'www', 'api', 'admin', 'mail', 'app', 'static', 'assets',
  'cdn', 'help', 'docs', 'blog', 'support', 'inbox', 'auth',
  'login', 'register', 'public', 'webhook', 'webhooks',
])

// Пути, которые ВСЕГДА работают только на портале my.clientcase.app
const PORTAL_ONLY_PATHS = ['/login', '/register', '/auth/callback', '/select-workspace']

// Публичные пути (без auth)
const PUBLIC_PATHS = [
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

type HostType =
  | { type: 'subdomain'; slug: string }
  | { type: 'portal' }
  | { type: 'root' }
  | { type: 'legacy' }

function detectHostType(host: string): HostType {
  // Убираем порт
  const cleanHost = host.split(':')[0].toLowerCase()

  if (cleanHost === PORTAL_HOST) return { type: 'portal' }
  if (cleanHost === ROOT_DOMAIN) return { type: 'root' }

  if (cleanHost.endsWith('.' + ROOT_DOMAIN)) {
    const slug = cleanHost.slice(0, -ROOT_DOMAIN.length - 1)
    if (SYSTEM_SUBDOMAINS.has(slug)) return { type: 'portal' }
    // Не возвращаем 'legacy' если slug содержит точку (вложенные поддомены) —
    // например, foo.bar.clientcase.app трактуем как foo-bar или legacy
    if (slug.includes('.')) return { type: 'legacy' }
    return { type: 'subdomain', slug }
  }

  return { type: 'legacy' }
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function isPortalOnlyPath(pathname: string): boolean {
  return PORTAL_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * Определяем домен для cookie. На *.clientcase.app — расшариваем через .clientcase.app.
 * На custom-доменах и legacy — оставляем дефолт (привязано к host).
 */
function getCookieDomain(host: string): string | undefined {
  const cleanHost = host.split(':')[0].toLowerCase()
  if (cleanHost === ROOT_DOMAIN || cleanHost.endsWith('.' + ROOT_DOMAIN)) {
    return '.' + ROOT_DOMAIN
  }
  return undefined
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const { pathname, search } = request.nextUrl
  const hostType = detectHostType(host)

  // Статика и API — пропускаем (уже исключены matcher'ом, но для надёжности)
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next()
  }

  // Публичные ссылки на статьи (шеринг клиентам): /a/<token>.
  // Работают на ЛЮБОМ host'е (поддомен / портал / custom / legacy), без
  // авторизации и БЕЗ rewrite в /workspaces/<id> — токен глобально уникален,
  // страница сама резолвит его через anon-RPC get_shared_article.
  if (pathname === '/a' || pathname.startsWith('/a/')) {
    return NextResponse.next()
  }

  // ---- ROOT ----
  // clientcase.app → редирект на my.clientcase.app
  if (hostType.type === 'root') {
    const url = new URL(`https://${PORTAL_HOST}${pathname}${search}`)
    return NextResponse.redirect(url, 308)
  }

  // ---- PORTAL (my.clientcase.app) ----
  if (hostType.type === 'portal') {
    // На портале разрешены только: PUBLIC_PATHS + /select-workspace + /create-workspace
    // Прочие пути — редирект на /select-workspace (если залогинен) или /login
    const allowedOnPortal =
      isPublicPath(pathname) ||
      pathname === '/select-workspace' ||
      pathname === '/create-workspace' ||
      pathname.startsWith('/select-workspace/') ||
      pathname.startsWith('/create-workspace/')

    if (!allowedOnPortal) {
      // Любой другой путь → /select-workspace
      return NextResponse.redirect(new URL('/select-workspace', request.url))
    }

    // Auth check
    return await handleAuthOnly(request, host, /* publicAllowed */ isPublicPath(pathname))
  }

  // ---- LEGACY REDIRECT HOSTS ----
  // Старые домены, с которых редиректим на новые поддомены *.clientcase.app.
  // Сейчас: clientcase.kvp-projects.com (старый dev-домен).
  // Логика:
  //   /workspaces/<uuid>/... → <slug>.clientcase.app/... (или custom_domain)
  //   Прочее → my.clientcase.app/... (портал)
  const cleanHost = host.split(':')[0].toLowerCase()
  if (cleanHost === 'clientcase.kvp-projects.com') {
    const wsMatch = pathname.match(
      /^\/workspaces\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/.*)?$/i,
    )
    if (wsMatch) {
      const ws = await getWorkspaceById(wsMatch[1])
      const remaining = wsMatch[2] || '/'
      if (ws?.slug) {
        return NextResponse.redirect(
          `https://${ws.slug}.${ROOT_DOMAIN}${remaining}${search}`,
          301,
        )
      }
      if (ws?.custom_domain) {
        return NextResponse.redirect(`https://${ws.custom_domain}${remaining}${search}`, 301)
      }
    }
    // Прочие пути → my.clientcase.app/<тот же путь>
    return NextResponse.redirect(`https://${PORTAL_HOST}${pathname}${search}`, 301)
  }

  // ---- SUBDOMAIN или LEGACY ----
  // Резолв воркспейса делаем для обоих, но с разной логикой rewrite

  // Портальные пути на поддомене *.clientcase.app → редирект на портал.
  // Cookies авторизации между my.clientcase.app и поддоменами расшарены
  // через Domain=.clientcase.app, поэтому единый портал имеет смысл.
  //
  // Для legacy/custom-домена (например app.relostart.com) редирект НЕ делаем:
  //   - cookies на custom-домене не расшарены с порталом, поэтому залогинить
  //     пользователя на портале и потом «как-то перенести» сессию нельзя
  //     без отдельного SSO-bridge'а
  //   - вместо этого custom-домен должен иметь свой независимый логин:
  //     /login, /register, /auth/callback показываются прямо на custom-домене,
  //     OAuth callback ставит cookies на этот домен → независимая сессия
  //   - в Supabase Dashboard → Authentication → URL Configuration
  //     должны быть добавлены https://<custom_domain>/auth/callback
  //
  // Pass-through для custom-домена реализован в handleWorkspaceHost ниже.
  if (isPortalOnlyPath(pathname) && hostType.type === 'subdomain') {
    const url = new URL(`https://${PORTAL_HOST}${pathname}${search}`)
    // Сохраняем привязку к воркспейсу: пользователь зашёл по ссылке поддомена
    // (rs.clientcase.app/login) — после входа на портале вернуть его на этот
    // поддомен, а не показывать выбор воркспейса. Только для /login и /register;
    // /auth/callback и /select-workspace остаются на портале.
    if ((pathname === '/login' || pathname === '/register') && !url.searchParams.get('next')) {
      url.searchParams.set('next', `https://${host}/`)
    }
    return NextResponse.redirect(url, 307)
  }

  if (hostType.type === 'subdomain' || hostType.type === 'legacy') {
    return await handleWorkspaceHost(request, host, hostType)
  }

  // Fallback (не должен срабатывать)
  return NextResponse.next()
}

/**
 * Обработка host'а, который должен быть воркспейсом (subdomain или custom_domain).
 * Для legacy — auth-only без rewrite.
 */
async function handleWorkspaceHost(
  request: NextRequest,
  host: string,
  hostType: HostType,
): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl

  // Резолв воркспейса по host (поддомен или custom_domain)
  // Для legacy host'ов резолв тоже пробуем — вдруг это custom_domain
  const workspace = await resolveWorkspaceByHost(host)

  if (!workspace && hostType.type === 'subdomain') {
    // Поддомен на clientcase.app, но не нашли воркспейса — 404
    return new NextResponse('Workspace not found', { status: 404 })
  }

  // Если найден воркспейс (subdomain или custom_domain)
  if (workspace) {
    const wsPrefix = `/workspaces/${workspace.id}`

    // 0a. Custom-домен (legacy + резолв по custom_domain): портальные пути
     //    показываем как корневые роуты, без rewrite в /workspaces/<id>/...
     //    Иначе rewrite уведёт на /workspaces/<id>/login — такой страницы нет, 404.
     //    Cookies сессии останутся на custom-домене (независимая авторизация).
     //    Для poddomain *.clientcase.app этот блок пропускается — там выше уже
     //    редирект на портал.
    if (hostType.type === 'legacy' && isPortalOnlyPath(pathname)) {
      // /select-workspace на custom-домене смысла не имеет (домен жёстко привязан
      // к одному воркспейсу) — редирект на корень.
      if (pathname === '/select-workspace' || pathname.startsWith('/select-workspace/')) {
        return NextResponse.redirect(new URL('/', request.url), 307)
      }
      return await handleAuthAndRewrite(request, host, pathname, search, false)
    }

    // 0. Маркетинговые публичные пути (/lawyers, /blog, /about, /privacy, /terms)
    //    на поддомене не показываем — это страницы публичного маркетплейса,
    //    их место на главном домене clientcase.app. Редирект на корень воркспейса.
    const PUBLIC_MARKETING_PATHS = ['/lawyers', '/blog', '/about', '/privacy', '/terms']
    if (PUBLIC_MARKETING_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      return NextResponse.redirect(new URL('/', request.url), 307)
    }

    // 1. URL уже с /workspaces/<uuid>/... → редирект на чистый URL
    //    но только если uuid совпадает с резолвленным воркспейсом
    if (pathname.startsWith(wsPrefix)) {
      const cleanPath = pathname.slice(wsPrefix.length) || '/'
      return await handleAuthAndRewrite(request, host, cleanPath, search, false)
    }

    // 2. URL начинается с /workspaces/<other-uuid>/... — на subdomain нельзя ходить в чужой воркспейс
    if (pathname.startsWith('/workspaces/') && hostType.type !== 'legacy') {
      return new NextResponse('Cannot access another workspace from this domain', { status: 404 })
    }

    // 3. Глобальные страницы юзера — без rewrite (общие для всех воркспейсов)
    const isGlobalUserPage =
      pathname === '/profile' ||
      pathname.startsWith('/profile/') ||
      pathname === '/dashboard' ||
      pathname === '/app' ||
      pathname.startsWith('/app/')

    if (isGlobalUserPage) {
      return await handleAuthAndRewrite(request, host, pathname, search, false)
    }

    // 4. /workspaces (список) на subdomain — редирект на портал
    if (pathname === '/workspaces' && hostType.type === 'subdomain') {
      return NextResponse.redirect(new URL(`https://${PORTAL_HOST}/select-workspace`))
    }

    // 5a. Если URL с UUID-ом проекта/доски — 301 редирект на короткий формат.
    //     Так все ссылки в коде остаются с UUID, но браузер всегда видит короткий URL.
    for (const entityType of ['projects', 'boards'] as const) {
      const uuidMatch = pathname.match(
        new RegExp(
          `^\\/${entityType}\\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})((\\/.*)?)$`,
          'i',
        ),
      )
      if (uuidMatch) {
        const uuid = uuidMatch[1]
        const remaining = uuidMatch[2] || ''
        const dbType = entityType === 'projects' ? 'project' : 'board'
        const shortId = await getShortIdByUuid(dbType, uuid)
        if (shortId !== null) {
          const redirectUrl = request.nextUrl.clone()
          redirectUrl.pathname = `/${entityType}/${shortId}${remaining}`
          return NextResponse.redirect(redirectUrl, 301)
        }
      }
    }

    // 5a'. Если в panelTab=thread:<uuid> — редирект на panelTab=thread:<short>
    const panelTab = request.nextUrl.searchParams.get('panelTab')
    if (panelTab) {
      const threadUuidMatch = panelTab.match(
        /^thread:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
      )
      if (threadUuidMatch) {
        const threadShortId = await getShortIdByUuid('thread', threadUuidMatch[1])
        if (threadShortId !== null) {
          const redirectUrl = request.nextUrl.clone()
          redirectUrl.searchParams.set('panelTab', `thread:${threadShortId}`)
          return NextResponse.redirect(redirectUrl, 301)
        }
      }
    }

    // 5b. Резолв short_id → UUID для коротких ссылок типа /projects/15 и /boards/3
    let pathToRewrite = pathname
    for (const entityType of ['projects', 'boards'] as const) {
      const shortMatch = pathname.match(new RegExp(`^\\/${entityType}\\/(\\d+)((\\/.*)?)$`))
      if (shortMatch) {
        const shortId = parseInt(shortMatch[1], 10)
        const remaining = shortMatch[2] || ''
        const dbType = entityType === 'projects' ? 'project' : 'board'
        const uuid = await resolveShortId(workspace.id, dbType, shortId)
        if (uuid) {
          pathToRewrite = `/${entityType}/${uuid}${remaining}`
        } else {
          return new NextResponse(`${entityType} not found`, { status: 404 })
        }
        break
      }
    }

    // 6. Всё остальное — rewrite на /workspaces/<uuid>/...
    const targetPath = wsPrefix + (pathToRewrite === '/' ? '' : pathToRewrite)
    return await handleAuthAndRewrite(request, host, targetPath, search, true)
  }

  // Legacy host без custom_domain match — оставляем существующую логику (без rewrite)
  return await handleAuthOnly(request, host, isPublicPath(pathname))
}


/**
 * Auth-проверка + опциональный rewrite на новый pathname.
 *
 * Также прокидываем `x-url` с полным исходным URL пользователя — Next 16
 * не даёт server-component layouts доступа к searchParams, и без этого
 * хедера серверные гарды не могут принимать решения на основе query
 * (например, сохранить `?panelTab=thread:…` при redirect из-за RLS на проект).
 */
async function handleAuthAndRewrite(
  request: NextRequest,
  host: string,
  newPath: string,
  search: string,
  doRewrite: boolean,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const isPublic = isPublicPath(newPath) || isPublicPath(pathname)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-url', request.nextUrl.toString())

  // Подготовка response: либо rewrite на новый путь, либо next
  let response: NextResponse
  if (doRewrite) {
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = newPath
    rewriteUrl.search = search
    response = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    })
  } else if (newPath !== pathname) {
    // Чистый редирект (например, /workspaces/<uuid>/projects → /projects на subdomain)
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = newPath
    redirectUrl.search = search
    return NextResponse.redirect(redirectUrl, 307)
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } })
  }

  if (isPublic) return response

  return await checkAuth(request, response, host)
}

/**
 * Auth-only логика без rewrite.
 */
async function handleAuthOnly(
  request: NextRequest,
  host: string,
  publicAllowed: boolean,
): Promise<NextResponse> {
  const response = NextResponse.next({ request: { headers: request.headers } })
  if (publicAllowed) return response
  return await checkAuth(request, response, host)
}

/**
 * Проверка Supabase сессии. На *.clientcase.app — cookie на домене .clientcase.app.
 */
async function checkAuth(
  request: NextRequest,
  response: NextResponse,
  host: string,
): Promise<NextResponse> {
  const cookieDomain = getCookieDomain(host)

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
            const finalOptions = cookieDomain ? { ...options, domain: cookieDomain } : options
            request.cookies.set(name, value)
            response.cookies.set(name, value, finalOptions)
          })
        },
      },
    },
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    // На clientcase.app — редирект на портал my.clientcase.app/login.
    // На custom-доменах и legacy host'ах — /login на том же host'е (legacy поведение).
    const cleanHost = host.split(':')[0].toLowerCase()
    const isOurDomain = cleanHost === ROOT_DOMAIN || cleanHost.endsWith('.' + ROOT_DOMAIN)

    if (isOurDomain) {
      const nextUrl = `https://${host}${request.nextUrl.pathname}${request.nextUrl.search}`
      const loginUrl = new URL(`https://${PORTAL_HOST}/login`)
      loginUrl.searchParams.set('next', nextUrl)
      return NextResponse.redirect(loginUrl, 307)
    }

    // Custom-домен или legacy — /login на том же host'е (без префикса проксирования)
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: '/:path*',
}

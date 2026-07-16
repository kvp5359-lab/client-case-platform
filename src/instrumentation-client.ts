// Sentry — инициализация на клиенте (браузер). Ловит ошибки рендеринга/рантайма
// у пользователей. DSN публичный (и так попадает в браузерный бандл).
import * as Sentry from '@sentry/nextjs'

// Транзиентный сетевой/загрузочный шум: моргнула сеть, отменённый запрос при
// уходе со страницы, оборванный upload/download, not-found гонки. Пользователь
// видит дружелюбную ошибку и повторяет — данные целы.
//
// Такие события ДРОПАЕМ (не шлём в Sentry вовсе), а не просто понижаем уровень:
// на плане Developer квота 5k событий/месяц считается по ФАКТУ отправки, уровень
// на неё не влияет. Если шум съест квоту — Sentry начнёт дропать всё подряд,
// включая реальные краши. Плюс шум растёт линейно с числом воркспейсов/юзеров.
// См. docs/bugs/open/2026-07-08-sentry-load-fail-noise.md.
const TRANSIENT_NOISE = [
  /^Не удалось загрузить/i,
  /^Ошибка загрузки/i,
  /^Ошибка подсчёта/i,
  /Failed to fetch/i,
  /Failed to load/i,
  /Load failed/i,
  /NetworkError/i,
  /Loading chunk \S+ failed/i,
  /TypeError: (Failed|Load|NetworkError)/i,
]

function collectEventText(event: Sentry.ErrorEvent): string {
  const parts: string[] = []
  if (typeof event.message === 'string') parts.push(event.message)
  for (const ex of event.exception?.values ?? []) {
    if (ex.type) parts.push(ex.type)
    if (ex.value) parts.push(ex.value)
  }
  return parts.join(' | ')
}

Sentry.init({
  dsn: 'https://426abd6d613020f14e5222931efac430@o4511676931637248.ingest.de.sentry.io/4511676935241808',
  // Доля трасс производительности (0 = только ошибки; поднять при желании).
  tracesSampleRate: 0,
  // Не собираем session replay (приватность переписки клиентов).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  enabled: process.env.NODE_ENV === 'production',
  // Не шумим ошибками расширений браузера / отменённых запросов.
  ignoreErrors: [
    'ResizeObserver loop',
    'AbortError',
    'Non-Error promise rejection captured',
  ],
  beforeSend(event) {
    const text = collectEventText(event)
    if (text && TRANSIENT_NOISE.some((re) => re.test(text))) return null
    return event
  },
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

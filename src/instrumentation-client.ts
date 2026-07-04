// Sentry — инициализация на клиенте (браузер). Ловит ошибки рендеринга/рантайма
// у пользователей. DSN публичный (и так попадает в браузерный бандл).
import * as Sentry from '@sentry/nextjs'

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
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

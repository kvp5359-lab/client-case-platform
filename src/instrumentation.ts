// Sentry — серверная/edge инициализация (Next instrumentation hook).
import * as Sentry from '@sentry/nextjs'

const DSN =
  'https://426abd6d613020f14e5222931efac430@o4511676931637248.ingest.de.sentry.io/4511676935241808'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: DSN,
      tracesSampleRate: 0,
      enabled: process.env.NODE_ENV === 'production',
    })
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: DSN,
      tracesSampleRate: 0,
      enabled: process.env.NODE_ENV === 'production',
    })
  }
}

// Ловит ошибки серверного рендеринга/роутов App Router.
export const onRequestError = Sentry.captureRequestError

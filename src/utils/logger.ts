/**
 * Централизованная система логирования
 *
 * В development режиме выводит логи в консоль
 * В production — ошибки дополнительно уходят в Sentry (отлов ошибок)
 */

import * as Sentry from '@sentry/nextjs'

const isDevelopment = process.env.NODE_ENV === 'development'

export const logger = {
  /**
   * Информационные сообщения
   */
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('[INFO]', ...args)
    }
  },

  /**
   * Предупреждения
   */
  warn: (...args: unknown[]) => {
    if (isDevelopment) {
      console.warn('[WARN]', ...args)
    }
  },

  /**
   * Ошибки — выводятся всегда (и в dev, и в production)
   */
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args)
    if (!isDevelopment) {
      // Первый аргумент — обычно объект ошибки; остальное кладём в контекст.
      const err = args[0]
      const extra = args.length > 1 ? { extra: { details: args.slice(1) } } : undefined
      if (err instanceof Error) {
        Sentry.captureException(err, extra)
      } else {
        Sentry.captureMessage(
          typeof err === 'string' ? err : JSON.stringify(err),
          { level: 'error', ...(extra ?? {}) },
        )
      }
    }
  },

  /**
   * Отладочные сообщения (только в development)
   */
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.debug('[DEBUG]', ...args)
    }
  },
}

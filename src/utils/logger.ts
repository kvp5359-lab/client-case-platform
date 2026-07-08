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
      // Ищем настоящую Error среди аргументов — call-sites часто пишут
      // logger.error('текст', err) ИЛИ logger.error(err). Без этого строка-
      // префикс попадала в captureMessage, а реальная ошибка (со стеком) —
      // терялась в extra, и все такие ошибки сваливались в одно issue.
      const err = args.find((a) => a instanceof Error) as Error | undefined
      const rest = args.filter((a) => a !== err)
      const extra = rest.length ? { extra: { details: rest } } : undefined
      if (err) {
        Sentry.captureException(err, extra)
      } else {
        const first = args[0]
        Sentry.captureMessage(
          typeof first === 'string' ? first : JSON.stringify(first),
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

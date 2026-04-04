/**
 * Централизованная система логирования
 *
 * В development режиме выводит логи в консоль
 * В production режиме логи не выводятся (можно подключить внешний сервис)
 */

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
    // В production здесь можно дополнительно отправлять в Sentry, LogRocket и т.д.
    // if (!isDevelopment) {
    //   Sentry.captureException(args[0])
    // }
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

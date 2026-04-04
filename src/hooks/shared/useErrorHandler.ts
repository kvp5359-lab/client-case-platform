"use client"

/**
 * Универсальный хук для обработки ошибок
 *
 * Использование:
 * ```tsx
 * const { handleError } = useErrorHandler()
 *
 * try {
 *   await someOperation()
 * } catch (error) {
 *   handleError(error, 'Не удалось выполнить операцию')
 * }
 * ```
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { AppError } from '@/services/errors'

export interface ErrorHandlerOptions {
  /** Показывать ли toast с ошибкой */
  showToast?: boolean
  /** Логировать ли ошибку в консоль */
  logError?: boolean
  /** Кастомное сообщение для пользователя */
  userMessage?: string
  /** Callback при ошибке */
  onError?: (error: unknown) => void
}

export interface UseErrorHandlerReturn {
  /** Обработать ошибку */
  handleError: (error: unknown, options?: ErrorHandlerOptions | string) => void
}

const DEFAULT_ERROR_MESSAGE = 'Произошла ошибка. Попробуйте ещё раз.'

/**
 * Хук для централизованной обработки ошибок
 */
export function useErrorHandler(): UseErrorHandlerReturn {
  const handleError = useCallback(
    (error: unknown, optionsOrMessage?: ErrorHandlerOptions | string) => {
      // Нормализуем опции
      const options: ErrorHandlerOptions =
        typeof optionsOrMessage === 'string'
          ? { showToast: true, logError: true, userMessage: optionsOrMessage }
          : { showToast: true, logError: true, ...optionsOrMessage }

      // Определяем сообщение для пользователя
      let userMessage = options.userMessage || DEFAULT_ERROR_MESSAGE

      // Если это AppError, используем его сообщение
      if (error instanceof AppError) {
        userMessage = error.message
      } else if (error instanceof Error) {
        // Для обычных ошибок можем показать их сообщение
        // но только если не задано кастомное
        if (!options.userMessage) {
          userMessage = error.message || DEFAULT_ERROR_MESSAGE
        }
      }

      // Показываем toast
      if (options.showToast !== false) {
        toast.error(userMessage)
      }

      // Логируем ошибку
      if (options.logError !== false) {
        if (error instanceof AppError) {
          logger.error(`[${error.code}] ${error.message}`, error.details)
        } else if (error instanceof Error) {
          logger.error(error.message, error)
        } else {
          logger.error('Unknown error', error)
        }
      }

      // Вызываем callback если есть
      if (options.onError) {
        options.onError(error)
      }
    },
    [],
  )

  return { handleError }
}

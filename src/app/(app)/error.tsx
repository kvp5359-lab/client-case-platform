"use client"

/**
 * Error boundary для приватной части приложения (app).
 * Ловит ошибки рендеринга страниц воркспейса/проекта/задач и показывает
 * локальный fallback, не ломая сайдбар и навигацию.
 */

import { useEffect } from 'react'
import { logger } from '@/utils/logger'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error('[app/(app)/error]', error)
  }, [error])

  const message = getUserFacingErrorMessage(error, 'Не удалось загрузить содержимое')

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Ошибка при загрузке раздела
      </h2>
      <p className="text-sm text-gray-600 mb-4 max-w-md">{message}</p>
      {process.env.NODE_ENV === 'development' && error.message && (
        <pre className="text-xs text-gray-400 mb-4 max-w-md overflow-auto whitespace-pre-wrap">{error.message}</pre>
      )}
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Повторить
      </button>
    </div>
  )
}

"use client"

/**
 * Error boundary для приватной части приложения (app).
 * Ловит ошибки рендеринга страниц воркспейса/проекта/задач и показывает
 * локальный fallback, не ломая сайдбар и навигацию.
 */

import { useEffect } from 'react'
import { logger } from '@/utils/logger'

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

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Ошибка при загрузке раздела
      </h2>
      <p className="text-sm text-gray-600 mb-4 max-w-md">
        {error.message || 'Не удалось загрузить содержимое'}
      </p>
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

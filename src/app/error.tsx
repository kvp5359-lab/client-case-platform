"use client"

/**
 * Глобальный error boundary для всех роутов.
 * Ловит ошибки рендеринга в любой странице и показывает fallback
 * с кнопкой повторной попытки (reset) без перезагрузки всего приложения.
 */

import { useEffect } from 'react'
import { logger } from '@/utils/logger'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error('[app/error]', error)
  }, [error])

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Что-то пошло не так
      </h2>
      <p className="text-sm text-gray-600 mb-4 max-w-md">
        {error.message || 'Произошла непредвиденная ошибка'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Попробовать снова
      </button>
    </div>
  )
}

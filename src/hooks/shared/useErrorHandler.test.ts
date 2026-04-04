/**
 * Тесты для useErrorHandler и useAsyncErrorHandler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Мокаем sonner
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

// Мокаем logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { useErrorHandler, useAsyncErrorHandler } from './useErrorHandler'
import { AppError } from '@/services/errors'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useErrorHandler', () => {
  it('должен показать toast.error с сообщением AppError', () => {
    const { result } = renderHook(() => useErrorHandler())
    const error = new AppError('Ошибка приложения', 'APP_ERR')

    act(() => {
      result.current.handleError(error)
    })

    expect(toast.error).toHaveBeenCalledWith('Ошибка приложения')
  })

  it('должен показать toast.error с сообщением обычной Error', () => {
    const { result } = renderHook(() => useErrorHandler())
    const error = new Error('Something went wrong')

    act(() => {
      result.current.handleError(error)
    })

    expect(toast.error).toHaveBeenCalledWith('Something went wrong')
  })

  it('должен показать сообщение по умолчанию для неизвестной ошибки', () => {
    const { result } = renderHook(() => useErrorHandler())

    act(() => {
      result.current.handleError(42)
    })

    expect(toast.error).toHaveBeenCalledWith('Произошла ошибка. Попробуйте ещё раз.')
  })

  it('должен использовать userMessage вместо сообщения ошибки', () => {
    const { result } = renderHook(() => useErrorHandler())
    const error = new Error('Technical error')

    act(() => {
      result.current.handleError(error, { userMessage: 'Пользовательское сообщение' })
    })

    expect(toast.error).toHaveBeenCalledWith('Пользовательское сообщение')
  })

  it('должен не показывать toast при showToast: false', () => {
    const { result } = renderHook(() => useErrorHandler())
    const error = new Error('Error')

    act(() => {
      result.current.handleError(error, { showToast: false })
    })

    expect(toast.error).not.toHaveBeenCalled()
  })

  it('должен не логировать при logError: false', () => {
    const { result } = renderHook(() => useErrorHandler())
    const error = new Error('Error')

    act(() => {
      result.current.handleError(error, { logError: false })
    })

    expect(logger.error).not.toHaveBeenCalled()
  })

  it('должен вызвать onError callback', () => {
    const { result } = renderHook(() => useErrorHandler())
    const error = new Error('Error')
    const onError = vi.fn()

    act(() => {
      result.current.handleError(error, { onError })
    })

    expect(onError).toHaveBeenCalledWith(error)
  })

  it('должен трактовать строковый аргумент как userMessage', () => {
    const { result } = renderHook(() => useErrorHandler())
    const error = new Error('Technical')

    act(() => {
      result.current.handleError(error, 'Понятное сообщение')
    })

    expect(toast.error).toHaveBeenCalledWith('Понятное сообщение')
  })
})

describe('useAsyncErrorHandler', () => {
  it('должен выполнить async функцию и вернуть результат', async () => {
    const { result } = renderHook(() => useAsyncErrorHandler())

    let res: string | null = null
    await act(async () => {
      res = await result.current.execute(async () => 'success')
    })

    expect(res).toBe('success')
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('должен обработать ошибку и вернуть null', async () => {
    const { result } = renderHook(() => useAsyncErrorHandler())
    const testError = new Error('Async fail')

    let res: unknown = 'not-null'
    await act(async () => {
      res = await result.current.execute(async () => {
        throw testError
      }, 'Не удалось')
    })

    expect(res).toBeNull()
    expect(result.current.error).toBe(testError)
    expect(result.current.loading).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Не удалось')
  })
})

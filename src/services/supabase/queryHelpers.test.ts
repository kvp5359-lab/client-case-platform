/**
 * Тесты для queryHelpers — утилиты безопасных запросов к Supabase
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  safeFetchOrThrow,
  safeDeleteOrThrow,
  safeInsertOrThrow,
  safeUpdateOrThrow,
} from './queryHelpers'
import { ApiError, DocumentError } from '../errors/AppError'
import type { PostgrestError } from '@supabase/supabase-js'

// Хелпер для создания моковой PostgrestError
function mockPostgrestError(
  overrides: Partial<PostgrestError> & { message: string; code: string },
): PostgrestError {
  return { name: 'PostgrestError', details: '', hint: '', ...overrides }
}

vi.mock('@/lib/supabase')
vi.mock('@/utils/logger')

// =====================================================
// safeFetchOrThrow
// =====================================================

describe('safeFetchOrThrow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должен вернуть data при успехе', async () => {
    const mockData = { id: '1', name: 'test' }
    const query = Promise.resolve({ data: mockData, error: null })

    const result = await safeFetchOrThrow(query, 'Test error')

    expect(result).toEqual(mockData)
  })

  it('должен бросить ApiError при ошибке (по умолчанию)', async () => {
    const mockError = mockPostgrestError({ message: 'Error', code: '500' })
    const query = Promise.resolve({ data: null, error: mockError })

    await expect(safeFetchOrThrow(query, 'Test failed')).rejects.toThrow(ApiError)
  })

  it('должен бросить кастомный ErrorClass', async () => {
    const mockError = mockPostgrestError({ message: 'Error', code: '500' })
    const query = Promise.resolve({ data: null, error: mockError })

    await expect(safeFetchOrThrow(query, 'Doc failed', DocumentError)).rejects.toThrow(
      DocumentError,
    )
  })

  it('должен пробросить AppError без оборачивания', async () => {
    const appError = new DocumentError('Already wrapped')
    const query = Promise.reject(appError)

    await expect(safeFetchOrThrow(query, 'Should not wrap')).rejects.toThrow(DocumentError)
    await expect(safeFetchOrThrow(query, 'Should not wrap')).rejects.toThrow('Already wrapped')
  })

  it('должен оборачивать не-AppError исключения', async () => {
    const query = Promise.reject(new Error('Network error'))

    await expect(safeFetchOrThrow(query, 'Network failed')).rejects.toThrow(ApiError)
  })
})

// =====================================================
// safeInsertOrThrow (делегирует safeFetchOrThrow)
// =====================================================

describe('safeInsertOrThrow', () => {
  it('должен вернуть data при успехе', async () => {
    const mockData = [{ id: '1' }]
    const query = Promise.resolve({ data: mockData, error: null })

    const result = await safeInsertOrThrow(query, 'Insert failed')
    expect(result).toEqual(mockData)
  })

  it('должен бросить ApiError при ошибке', async () => {
    const mockError = mockPostgrestError({ message: 'Duplicate', code: '23505' })
    const query = Promise.resolve({ data: null, error: mockError })

    await expect(safeInsertOrThrow(query, 'Insert failed')).rejects.toThrow(ApiError)
  })
})

// =====================================================
// safeUpdateOrThrow (делегирует safeFetchOrThrow)
// =====================================================

describe('safeUpdateOrThrow', () => {
  it('должен вернуть data при успехе', async () => {
    const mockData = [{ id: '1', name: 'updated' }]
    const query = Promise.resolve({ data: mockData, error: null })

    const result = await safeUpdateOrThrow(query, 'Update failed')
    expect(result).toEqual(mockData)
  })

  it('должен бросить ApiError при ошибке', async () => {
    const mockError = mockPostgrestError({ message: 'Not found', code: 'PGRST116' })
    const query = Promise.resolve({ data: null, error: mockError })

    await expect(safeUpdateOrThrow(query, 'Update failed')).rejects.toThrow(ApiError)
  })
})

// =====================================================
// safeDeleteOrThrow (void-обёртка)
// =====================================================

describe('safeDeleteOrThrow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('не должен бросать при успехе', async () => {
    const query = Promise.resolve({ error: null })

    await expect(safeDeleteOrThrow(query, 'Delete failed')).resolves.not.toThrow()
  })

  it('должен бросить ошибку при error', async () => {
    const mockError = mockPostgrestError({ message: 'FK violation', code: '23503' })
    const query = Promise.resolve({ error: mockError })

    await expect(safeDeleteOrThrow(query, 'Delete failed')).rejects.toThrow(ApiError)
  })

  it('должен пробросить AppError без оборачивания', async () => {
    const appError = new DocumentError('Already wrapped')
    const query = Promise.reject(appError)

    await expect(safeDeleteOrThrow(query, 'Should not wrap')).rejects.toThrow(DocumentError)
  })
})

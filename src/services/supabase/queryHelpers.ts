/**
 * Утилиты для безопасной работы с Supabase запросами
 *
 * Централизованная обработка ошибок и типизация результатов.
 * Используются throwing-версии (OrThrow) в сервисном слое.
 */

import { logger } from '@/utils/logger'
import type { PostgrestError } from '@supabase/supabase-js'
import { AppError, ApiError } from '../errors'

// =====================================================
// Throwing-версии (для сервисного слоя)
// =====================================================

type ErrorConstructor = new (message: string, details?: unknown) => Error

/**
 * SELECT с выбросом ошибки при неудаче.
 * Используется в сервисах вместо ручного try-catch + logger.error + throw.
 */
export async function safeFetchOrThrow<T>(
  query: PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  errorMessage: string,
  ErrorClass: ErrorConstructor = ApiError,
): Promise<T> {
  try {
    const { data, error } = await query

    if (error) {
      logger.error(`${errorMessage}:`, error)
      throw new ErrorClass(errorMessage, error)
    }

    return data as T
  } catch (err) {
    if (err instanceof AppError) throw err
    logger.error(`${errorMessage}:`, err)
    throw new ErrorClass(errorMessage, err)
  }
}

/**
 * INSERT с выбросом ошибки при неудаче.
 */
export async function safeInsertOrThrow<T>(
  query: PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  errorMessage: string,
  ErrorClass: ErrorConstructor = ApiError,
): Promise<T> {
  return safeFetchOrThrow<T>(query, errorMessage, ErrorClass)
}

/**
 * UPDATE с выбросом ошибки при неудаче.
 */
export async function safeUpdateOrThrow<T>(
  query: PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  errorMessage: string,
  ErrorClass: ErrorConstructor = ApiError,
): Promise<T> {
  return safeFetchOrThrow<T>(query, errorMessage, ErrorClass)
}

/**
 * Void-обёртка: проверяет только { error }, не читает data.
 * Подходит для DELETE, INSERT, UPDATE без .select().
 */
async function safeVoidQueryOrThrow(
  query: PromiseLike<{ error: PostgrestError | null }>,
  errorMessage: string,
  ErrorClass: ErrorConstructor = ApiError,
): Promise<void> {
  try {
    const { error } = await query

    if (error) {
      logger.error(`${errorMessage}:`, error)
      throw new ErrorClass(errorMessage, error)
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    logger.error(`${errorMessage}:`, err)
    throw new ErrorClass(errorMessage, err)
  }
}

/**
 * DELETE с выбросом ошибки при неудаче.
 */
export const safeDeleteOrThrow = safeVoidQueryOrThrow

/**
 * INSERT без возврата данных (без .select()).
 */
export const safeInsertVoidOrThrow = safeVoidQueryOrThrow

/**
 * UPDATE без возврата данных (без .select()).
 */
export const safeUpdateVoidOrThrow = safeVoidQueryOrThrow

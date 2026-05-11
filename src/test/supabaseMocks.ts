/**
 * Типизированные helpers для подмены частей `supabase` клиента в тестах.
 *
 * Раньше каждый тест писал `(supabase.rpc as any) = vi.fn()` —
 * 20+ мест с `as any`. Хелперы локализуют один `as unknown as`
 * каст и дают типизированный API.
 *
 * Использование:
 *   import { mockSupabaseRpc, setSupabaseRpcMock, setSupabaseAuth } from '@/test/supabaseMocks'
 *
 *   mockSupabaseRpc({ data: [{...}], error: null })  // одноразовый ответ
 *   const m = vi.fn().mockResolvedValueOnce(...).mockResolvedValueOnce(...)
 *   setSupabaseRpcMock(m)                            // готовый mock-объект
 *   setSupabaseAuth({ getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) })
 */

import { vi, type Mock } from 'vitest'
import { supabase } from '@/lib/supabase'

type SupabaseInternals = {
  rpc: Mock
  auth: typeof supabase.auth
}

/**
 * Подменяет `supabase.rpc` на mock с одним фиксированным результатом.
 * Возвращает созданный Mock — можно сразу assert'ить вызовы.
 */
export function mockSupabaseRpc<T = unknown>(returnValue: {
  data: T | null
  error: unknown
}): Mock {
  const fn = vi.fn().mockResolvedValue(returnValue)
  ;(supabase as unknown as SupabaseInternals).rpc = fn
  return fn
}

/**
 * Подменяет `supabase.rpc` на заранее подготовленный Mock.
 * Используй, когда нужен сложный поведения — например
 * `vi.fn().mockResolvedValueOnce(...).mockResolvedValueOnce(...)`.
 */
export function setSupabaseRpcMock(mock: Mock): void {
  ;(supabase as unknown as SupabaseInternals).rpc = mock
}

/**
 * Заменяет `supabase.auth` на частичный mock — обычно для подмены
 * `getUser` / `getSession` / `signInWithPassword`. Сохраняет остальные
 * методы из существующего auth.
 */
export function setSupabaseAuth(auth: Partial<typeof supabase.auth>): void {
  ;(supabase as unknown as SupabaseInternals).auth = {
    ...supabase.auth,
    ...auth,
  } as typeof supabase.auth
}

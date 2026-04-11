/**
 * Глобальный setup для Vitest.
 *
 * Подставляет фиктивные значения NEXT_PUBLIC_SUPABASE_* до того,
 * как любой импорт дойдёт до `src/lib/supabase.ts` — иначе этот модуль
 * бросает ошибку при отсутствии переменных и валит 18 тестовых файлов
 * на стадии импорта.
 *
 * Использовать реальные креды здесь НЕЛЬЗЯ: тесты не должны подключаться
 * к продакшен-БД даже случайно. Значения фиктивные; реальные запросы
 * должны мокаться через vi.mock('@/lib/supabase') в конкретных тестах.
 */

import { vi } from 'vitest'

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key-not-real'

/**
 * Глобальный mock для supabase-клиента.
 *
 * Тесты в этом проекте исторически использовали `vi.mocked(supabase.from)` без
 * локального `vi.mock('@/lib/supabase')`, полагаясь на то, что `supabase.ts`
 * кидает ошибку при отсутствии env-переменных и тест вообще не доходит до
 * запуска. Теперь, когда env подставлены выше, без глобального mock'а тесты
 * попытаются дернуть настоящий клиент Supabase (с фейковым URL) и свалятся.
 *
 * Этот глобальный mock делает supabase.from() мок-функцией по умолчанию —
 * конкретные тесты всё так же конфигурируют её через
 * `vi.mocked(supabase.from).mockImplementation(...)`.
 */
vi.mock('@/lib/supabase', () => {
  const chain = () => {
    const obj: Record<string, ReturnType<typeof vi.fn>> = {}
    const methods = [
      'select',
      'insert',
      'update',
      'upsert',
      'delete',
      'eq',
      'neq',
      'in',
      'is',
      'gt',
      'gte',
      'lt',
      'lte',
      'like',
      'ilike',
      'or',
      'and',
      'not',
      'contains',
      'containedBy',
      'overlaps',
      'match',
      'range',
      'limit',
      'order',
      'single',
      'maybeSingle',
      'throwOnError',
    ]
    for (const m of methods) {
      obj[m] = vi.fn(() => obj as unknown)
    }
    obj.then = vi.fn((resolve: (value: unknown) => unknown) =>
      resolve({ data: null, error: null }),
    )
    return obj
  }
  return {
    supabase: {
      from: vi.fn(() => chain()),
      rpc: vi.fn(() => chain()),
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
      },
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(() => Promise.resolve({ data: null, error: null })),
          remove: vi.fn(() => Promise.resolve({ data: null, error: null })),
          download: vi.fn(() => Promise.resolve({ data: null, error: null })),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })),
          createSignedUrl: vi.fn(() =>
            Promise.resolve({ data: { signedUrl: '' }, error: null }),
          ),
        })),
      },
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      })),
      removeChannel: vi.fn(),
    },
  }
})

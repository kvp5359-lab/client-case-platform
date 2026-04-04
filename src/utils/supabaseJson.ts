/**
 * Утилиты для работы с типом Json из Supabase.
 *
 * Supabase генерирует тип `Json` (union: string | number | boolean | null | object | array)
 * для всех jsonb-колонок. Наши бизнес-типы (ProjectModuleAccess, ProjectPermissions и т.д.)
 * структурно несовместимы с Json напрямую, поэтому TypeScript требует double assertion.
 *
 * Эти утилиты инкапсулируют приведение в одном месте, чтобы в остальном коде
 * не было `as unknown as T`.
 */

import type { Json } from '@/types/database'

/**
 * Приводит значение Json из Supabase к конкретному типу T.
 * Используется для jsonb-колонок, чья структура гарантируется бизнес-логикой
 * (дефолтные значения в БД, миграции, валидация на уровне API).
 *
 * ВНИМАНИЕ: runtime-валидация НЕ выполняется — это чисто TypeScript-приведение типа.
 * Корректность данных обеспечивается на уровне БД (дефолты, миграции) и API.
 *
 * @example
 * const access = fromSupabaseJson<ProjectModuleAccess>(role.module_access)
 */
export function fromSupabaseJson<T>(value: Json): T {
  return value as unknown as T
}

/**
 * Приводит типизированное значение обратно к Json для сохранения в Supabase.
 *
 * @example
 * onSave({ permissions: toSupabaseJson(permissions) })
 */
export function toSupabaseJson<T>(value: T): Json {
  return value as unknown as Json
}

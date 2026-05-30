import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * Доступ к таблицам модуля «План» до регенерации src/types/database.ts.
 *
 * Таблицы `project_plan_blocks` / `project_template_plan_blocks` создаются
 * миграцией 20260530_plan_module.sql и пока отсутствуют в сгенерированных
 * типах. Чтобы код модуля компилировался до применения миграции и
 * `supabase gen types`, обращаемся к ним через клиент без схемы Database и
 * приводим результаты к локальным типам из `@/types/plan`.
 *
 * После применения миграции и регенерации типов этот мост можно убрать,
 * заменив `planDb.from(...)` на обычный `supabase.from(...)`.
 */
export const planDb = supabase as unknown as SupabaseClient

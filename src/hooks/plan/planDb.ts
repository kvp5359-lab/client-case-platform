import { supabase } from '@/lib/supabase'

/**
 * Доступ к таблицам модуля «План» (`project_plan_blocks` /
 * `project_template_plan_blocks`). Раньше здесь был нетипизированный мост
 * (`as unknown as SupabaseClient`), пока таблицы отсутствовали в
 * сгенерированных типах. Сейчас они есть в `@/types/database`, поэтому
 * `planDb` — это обычный типизированный клиент. Алиас оставлен, чтобы не
 * трогать call-sites; можно постепенно заменить на `supabase`.
 */
export const planDb = supabase

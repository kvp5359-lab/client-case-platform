import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Клиент к ВНЕШНЕЙ общей базе ВНЖ (Supabase-проект `mig-modules`, схема `mod_choice`).
 *
 * Это НЕ основной клиент client-case — отдельная база, общая с relostart/migchoice.com.
 * Используется только модулем «Подбор ВНЖ». Анонимное чтение справочника
 * (страны, виды ВНЖ, критерии, правила). Запись критериев — позже, через Edge.
 *
 * Синглтон на вкладку браузера. Без сессии (своей авторизации у внешней базы нет).
 */
let client: SupabaseClient | null = null

export function getResidenceModuleClient(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_MODULE_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_MODULE_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error(
        'Не заданы NEXT_PUBLIC_MODULE_SUPABASE_URL / NEXT_PUBLIC_MODULE_SUPABASE_ANON_KEY — ' +
          'нет доступа к внешней базе ВНЖ (mig-modules).',
      )
    }
    client = createClient(url, key, { auth: { persistSession: false } })
  }
  return client
}

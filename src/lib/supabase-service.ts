import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Service-role клиент Supabase для серверных API-routes (webhook'ов).
 * Не использует cookies — обходит RLS, поэтому доступен только из защищённых маршрутов.
 * Никогда не импортировать в клиентский код.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY и NEXT_PUBLIC_SUPABASE_URL обязательны для service-role клиента',
    )
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

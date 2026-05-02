/**
 * Supabase service-role клиент.
 *
 * MTProto-сервис всегда работает от имени service role — он самостоятельный
 * процесс, не действует от лица конкретного пользователя. RLS обходит,
 * проверки прав делаем сами в эндпоинтах (по INTERNAL_SECRET).
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "./config.js"

export const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
)

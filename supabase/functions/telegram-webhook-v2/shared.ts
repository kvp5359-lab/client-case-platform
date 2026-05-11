/**
 * Общие синглтоны webhook'а:
 *  - `service` — Supabase service-role клиент (одна connection-pool на все
 *    handler'ы).
 *  - `BOT_TOKEN` — токен @rs2_support_bot. Подгружается при первом обращении
 *    к ratelimit-aware loader'у (в `setupBotToken`), потом висит как
 *    модульное значение. Все handler'ы импортируют через `getBotToken()`.
 *
 * Раньше `service` и `BOT_TOKEN` были глобалями в index.ts, чем мешали
 * переносу handler'ов в отдельные файлы. Теперь вынесены сюда.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const BOT_VERSION = "v2";
export const PAGE_SIZE = 8;

export const service: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let _botToken = "";

export function getBotToken(): string {
  return _botToken;
}

export function setBotToken(token: string): void {
  _botToken = token;
}

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
import { AsyncLocalStorage } from "node:async_hooks";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const BOT_VERSION = "v2";
export const PAGE_SIZE = 8;

export const service: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Токен бота — REQUEST-SCOPED через AsyncLocalStorage. Deno.serve обслуживает
// параллельные запросы в одном изоляте; раньше токен жил в модульной
// переменной _botToken, и webhook второго бота одной группы перетирал её,
// пока первый после await'ов ещё работал → команды/ответы уходили не тем
// ботом (гонка G10). ALS изолирует токен по async-цепочке каждого запроса:
// index.ts оборачивает обработку в botTokenStore.run(token, …), а getBotToken()
// (его читают все tgCall/sendMessage/editMessage/answerCallback) берёт токен
// из контекста этого запроса. _botToken оставлен как фолбэк для путей вне run.
const botTokenStore = new AsyncLocalStorage<string>();
let _botToken = "";

export function runWithBotToken<T>(token: string, fn: () => T): T {
  return botTokenStore.run(token, fn);
}

export function getBotToken(): string {
  return botTokenStore.getStore() ?? _botToken;
}

export function setBotToken(token: string): void {
  _botToken = token;
}

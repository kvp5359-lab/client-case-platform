/**
 * Общие helpers для Edge Functions: CORS, JSON-ответы, авторизация, клиенты.
 * Цель — убрать копи-пейст в 20+ функциях (cors-headers, createClient,
 * x-internal-secret-проверки, response builders).
 *
 * Использование:
 *   import { jsonRes, getServiceClient, requireInternalSecret } from "../_shared/edge.ts"
 *
 *   Deno.serve(async (req) => {
 *     if (req.method === "OPTIONS") return preflight();
 *     if (!requireInternalSecret(req)) return jsonRes({ error: "unauthorized" }, 401);
 *     const service = getServiceClient();
 *     ...
 *     return jsonRes({ ok: true });
 *   });
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "./cors.ts";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
export const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

/**
 * Динамический CORS — проверяет Origin по whitelist'у из _shared/cors.ts.
 * Добавляет наш специфичный header `x-internal-secret` к базовым.
 * Allow-Methods оставляем широким (GET/POST/OPTIONS) — функции с GET-эндпоинтами
 * (например, email-track pixel) тоже должны проходить preflight.
 */
export function corsHeadersFor(req: Request): Record<string, string> {
  const base = getCorsHeaders(req);
  return {
    ...base,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-internal-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

/** Ответ на CORS preflight. */
export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeadersFor(req) });
}

/** Стандартный JSON-ответ с динамическими CORS-заголовками. */
export function jsonRes(payload: unknown, status = 200, req?: Request): Response {
  const cors = req ? corsHeadersFor(req) : getCorsHeaders(new Request("https://internal"));
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

/** Простой "ok" 200 — для no-op методов webhook'ов. */
export function okText(): Response {
  return new Response("ok", { status: 200 });
}

/**
 * Проверка x-internal-secret заголовка. Используется в функциях, которые
 * вызываются БД-триггером через `net.http_post` (там JWT не передать,
 * только кастомные заголовки).
 *
 * Возвращает true если секрет валиден или (опционально) если его нет, но
 * пришёл валидный Bearer-JWT (для функций с verify_jwt=true).
 */
export function requireInternalSecret(req: Request, allowBearer = false): boolean {
  const got = req.headers.get("x-internal-secret");
  if (got && INTERNAL_FUNCTION_SECRET && got === INTERNAL_FUNCTION_SECRET) return true;
  if (allowBearer && (req.headers.get("authorization") ?? "").startsWith("Bearer ")) return true;
  return false;
}

/** Service-role клиент (полные права, обходит RLS). */
export function getServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Клиент с пользовательским JWT — для проверки доступа через RLS.
 * Берёт Bearer-токен из заголовка Authorization.
 */
export function getUserClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
}

/** Достаёт залогиненного пользователя по Bearer-JWT. null если не авторизован. */
export async function getUser(req: Request): Promise<{ id: string } | null> {
  const userClient = getUserClient(req);
  const { data: { user } } = await userClient.auth.getUser();
  return user ? { id: user.id } : null;
}

// ===========================================================================
// Дедуп исходящих echo (Зона 5 рефакторинга)
// ===========================================================================

/**
 * Помечает (channel, messageId) как наше исходящее — чтобы webhook этого
 * канала при `isEcho=true` пропустил его и не создал дубль в треде.
 *
 * Используется когда отправляемое сообщение НЕ имеет собственной строки
 * в `project_messages` с таким `<channel>_message_id` (например, мы шлём
 * эмодзи-реплай как часть реакции — реакция живёт в `message_reactions`).
 * Если запись в `project_messages` будет — UNIQUE на `<channel>_message_id`
 * сам отсечёт дубль и `markOutgoingExternal` не нужен.
 */
export async function markOutgoingExternal(
  service: SupabaseClient,
  channel: string,
  messageId: string,
  reason?: string,
): Promise<void> {
  await service
    .from("external_outgoing_dedup")
    .insert({ channel, message_id: messageId, reason: reason ?? null });
}

/** Проверяет, есть ли (channel, messageId) в dedup-таблице. */
export async function isOutgoingEcho(
  service: SupabaseClient,
  channel: string,
  messageId: string,
): Promise<boolean> {
  const { data } = await service
    .from("external_outgoing_dedup")
    .select("message_id")
    .eq("channel", channel)
    .eq("message_id", messageId)
    .maybeSingle();
  return !!data;
}

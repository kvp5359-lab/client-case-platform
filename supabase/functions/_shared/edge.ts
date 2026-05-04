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

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
export const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

/** Ответ на CORS preflight. */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/** Стандартный JSON-ответ с CORS-заголовками. */
export function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
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

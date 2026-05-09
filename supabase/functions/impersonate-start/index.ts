/**
 * Edge Function: impersonate-start
 *
 * Владелец воркспейса инициирует «вход под пользователем». Функция:
 * 1) валидирует JWT владельца (Bearer Authorization);
 * 2) создаёт запись в impersonation_sessions через RPC (там — все проверки прав);
 * 3) подписывает кастомный access_token (HS256, секрет = JWT_SIGNING_SECRET)
 *    с claim app_metadata.impersonated_by = owner_id;
 * 4) возвращает токен фронту. TTL — 30 минут.
 *
 * Триггер БД prevent_writes_during_impersonation блокирует любые DML
 * под этим JWT — режим строго read-only.
 *
 * Auth: Bearer JWT владельца. JWT_SIGNING_SECRET — из env (одноимённый
 * секрет проекта Supabase, тот же, которым подписывает GoTrue).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SIGNING_SECRET = Deno.env.get("JWT_SIGNING_SECRET")!;

const TTL_SECONDS = 30 * 60;

interface RequestBody {
  workspace_id: string;
  target_user_id: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!JWT_SIGNING_SECRET) {
    console.error("[impersonate-start] JWT_SIGNING_SECRET missing in env");
    return jsonResponse(
      { error: "Server misconfigured: JWT_SIGNING_SECRET not set" },
      500,
      corsHeaders,
    );
  }

  const auth = req.headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData.user) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }
  const ownerId = userData.user.id;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
  }
  if (!body.workspace_id || !body.target_user_id) {
    return jsonResponse(
      { error: "workspace_id and target_user_id are required" },
      400,
      corsHeaders,
    );
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Сведения о target — для возврата фронту (имя, email).
  const { data: targetAuth, error: targetAuthErr } = await service.auth.admin
    .getUserById(body.target_user_id);
  if (targetAuthErr || !targetAuth?.user) {
    return jsonResponse({ error: "Target user not found" }, 404, corsHeaders);
  }
  const targetEmail = targetAuth.user.email ?? "";

  const { data: targetParticipant } = await service
    .from("participants")
    .select("id, name, last_name")
    .eq("user_id", body.target_user_id)
    .eq("workspace_id", body.workspace_id)
    .eq("is_deleted", false)
    .maybeSingle();

  // Подготавливаем JWT-параметры заранее, чтобы записать их в БД.
  const jti = crypto.randomUUID();
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + TTL_SECONDS;
  const expiresAtIso = new Date(expSec * 1000).toISOString();

  // Все проверки прав — в RPC. Если что-то не так, она бросит исключение.
  const { data: sessionId, error: rpcErr } = await service.rpc(
    "start_impersonation_session",
    {
      p_owner_user_id: ownerId,
      p_workspace_id: body.workspace_id,
      p_target_user_id: body.target_user_id,
      p_jti: jti,
      p_expires_at: expiresAtIso,
      p_user_agent: req.headers.get("user-agent") ?? null,
      p_ip: req.headers.get("x-forwarded-for") ?? null,
    },
  );
  if (rpcErr || !sessionId) {
    console.error("[impersonate-start] rpc error:", rpcErr);
    const msg = rpcErr?.message ?? "Failed to start impersonation";
    const status = msg.includes("owner") || msg.includes("permission") ? 403 : 400;
    return jsonResponse({ error: msg }, status, corsHeaders);
  }

  // Подпись JWT по тому же HS256-секрету, что и обычные токены Supabase.
  const secretKey = new TextEncoder().encode(JWT_SIGNING_SECRET);
  const issuer = `${SUPABASE_URL}/auth/v1`;

  const token = await new SignJWT({
    email: targetEmail,
    phone: targetAuth.user.phone ?? "",
    app_metadata: {
      provider: "impersonation",
      providers: ["impersonation"],
      impersonated_by: ownerId,
      impersonation_session_id: sessionId,
    },
    user_metadata: targetAuth.user.user_metadata ?? {},
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "impersonation", timestamp: nowSec }],
    // Намеренно НЕ ставим session_id: GoTrue валидирует его против auth.sessions
    // ("session_not_found" 403, если не найден). Записи в auth.sessions
    // создаются только обычным флоу логина, нам её симулировать неоткуда.
    // jti (ниже через setJti) идентифицирует сам JWT — этого достаточно.
    is_anonymous: false,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(body.target_user_id)
    .setAudience("authenticated")
    .setIssuer(issuer)
    .setIssuedAt(nowSec)
    .setExpirationTime(expSec)
    .setJti(jti)
    .sign(secretKey);

  return jsonResponse(
    {
      access_token: token,
      token_type: "bearer",
      expires_at: expiresAtIso,
      expires_in: TTL_SECONDS,
      session_id: sessionId,
      target: {
        id: body.target_user_id,
        email: targetEmail,
        name: targetParticipant?.name ?? null,
        last_name: targetParticipant?.last_name ?? null,
      },
    },
    200,
    corsHeaders,
  );
});

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

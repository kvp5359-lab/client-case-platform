/**
 * Edge Function: impersonate-end
 *
 * Завершает сессию импersonации (ставит ended_at).
 * Может вызвать:
 *  - сам владелец (из своей обычной сессии);
 *  - сам импersonированный пользователь (из импersonационного JWT) — кнопка
 *    «Выйти из режима».
 *
 * Auth: Bearer JWT (любого вида — RPC внутри проверит).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface RequestBody {
  session_id: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const auth = req.headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
  }
  if (!body.session_id) {
    return jsonResponse({ error: "session_id required" }, 400, corsHeaders);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });

  const { error: rpcErr } = await userClient.rpc("end_impersonation_session", {
    p_session_id: body.session_id,
  });
  if (rpcErr) {
    console.error("[impersonate-end] rpc error:", rpcErr);
    return jsonResponse({ error: rpcErr.message }, 400, corsHeaders);
  }

  return jsonResponse({ ok: true }, 200, corsHeaders);
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

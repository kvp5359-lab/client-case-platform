/**
 * Edge Function: telegram-mtproto-auth
 *
 * Прокси между фронтом и MTProto-сервисом на VPS для auth-flow:
 * send-code → verify-code → (optional) verify-password → connected.
 * Также disconnect и status.
 *
 * Защита: JWT юзера обязателен. user_id из запроса всегда сверяется с
 * user.id из JWT — нельзя подключить чужую сессию даже зная user_id.
 *
 * x-internal-secret хранится в edge-окружении и не светится в браузер.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MTPROTO_SERVICE_URL = Deno.env.get("MTPROTO_SERVICE_URL")
  ?? "https://mtproto.kvp-projects.com";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

type Op = "send-code" | "verify-code" | "verify-password" | "disconnect" | "status";

interface RequestBody {
  op: Op;
  workspace_id?: string;
  phone?: string;
  code?: string;
  password?: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  // JWT юзера
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  // Для send-code дополнительно проверяем что юзер — участник воркспейса.
  if (body.op === "send-code") {
    if (!body.workspace_id || !body.phone) {
      return jsonResponse({ error: "workspace_id and phone required" }, 400, corsHeaders);
    }
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: participant } = await service
      .from("participants")
      .select("id")
      .eq("user_id", user.id)
      .eq("workspace_id", body.workspace_id)
      .eq("is_deleted", false)
      .maybeSingle();
    if (!participant) {
      return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
    }
    return await proxy("/auth/send-code", "POST", {
      user_id: user.id,
      workspace_id: body.workspace_id,
      phone: body.phone,
    }, corsHeaders);
  }

  if (body.op === "verify-code") {
    if (!body.code) {
      return jsonResponse({ error: "code required" }, 400, corsHeaders);
    }
    return await proxy("/auth/verify-code", "POST", {
      user_id: user.id,
      code: body.code,
    }, corsHeaders);
  }

  if (body.op === "verify-password") {
    if (!body.password) {
      return jsonResponse({ error: "password required" }, 400, corsHeaders);
    }
    return await proxy("/auth/verify-password", "POST", {
      user_id: user.id,
      password: body.password,
    }, corsHeaders);
  }

  if (body.op === "disconnect") {
    return await proxy("/auth/disconnect", "POST", {
      user_id: user.id,
    }, corsHeaders);
  }

  if (body.op === "status") {
    const url = `${MTPROTO_SERVICE_URL}/auth/status?user_id=${encodeURIComponent(user.id)}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "x-internal-secret": INTERNAL_SECRET },
      });
      const text = await res.text();
      return new Response(text, {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return jsonResponse({ error: `service unreachable: ${err}` }, 502, corsHeaders);
    }
  }

  return jsonResponse({ error: `Unknown op: ${body.op}` }, 400, corsHeaders);
});

async function proxy(
  path: string,
  method: string,
  payload: unknown,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const res = await fetch(`${MTPROTO_SERVICE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return jsonResponse({ error: `service unreachable: ${err}` }, 502, corsHeaders);
  }
}

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

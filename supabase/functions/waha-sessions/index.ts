/**
 * Edge Function: waha-sessions — управление сессиями WhatsApp (WAHA) из фронта.
 *
 * Прокси к WAHA API (ключ не светится фронту). Операции:
 *  - op=create  — создать/пересоздать сессию сотрудника в WAHA (store+webhook), запись в waha_sessions
 *  - op=qr      — QR-код для привязки (base64 data URL)
 *  - op=status  — актуальный статус сессии из WAHA (+ синк в waha_sessions)
 *  - op=logout  — отвязать номер (logout в WAHA, статус STOPPED)
 *
 * Авторизация: пользовательский JWT (verify_jwt=true) + проверка членства в воркспейсе.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WAHA_URL = (Deno.env.get("WAHA_URL") ?? "").replace(/\/+$/, "");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") ?? "";
const WAHA_WEBHOOK_SECRET = Deno.env.get("WAHA_WEBHOOK_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function service(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function waha(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${WAHA_URL}${path}`, {
    ...init,
    headers: { "X-Api-Key": WAHA_API_KEY, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

// имя сессии: детерминированное по (workspace,user) — позволяет переподключение
function sessionName(workspaceId: string, userId: string): string {
  return `w${workspaceId.replace(/-/g, "").slice(0, 12)}u${userId.replace(/-/g, "").slice(0, 12)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!WAHA_URL || !WAHA_API_KEY) return json({ error: "WAHA не настроен" }, 500);

  // Пользователь
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { op?: string; workspace_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { op, workspace_id } = body;
  if (!op || !workspace_id) return json({ error: "op/workspace_id required" }, 400);

  const svc = service();

  // Членство в воркспейсе
  const { data: member } = await svc.from("participants")
    .select("id").eq("user_id", user.id).eq("workspace_id", workspace_id)
    .eq("is_deleted", false).maybeSingle();
  if (!member) return json({ error: "Не участник воркспейса" }, 403);

  const name = sessionName(workspace_id, user.id);
  const webhookUrl = `${SUPABASE_URL}/functions/v1/waha-webhook?key=${WAHA_WEBHOOK_SECRET}`;
  const sessionConfig = {
    noweb: { store: { enabled: true, fullSync: true } },
    webhooks: [{ url: webhookUrl, events: ["message", "session.status"] }],
  };

  try {
    if (op === "create") {
      // upsert записи в waha_sessions
      await svc.from("waha_sessions").upsert({
        workspace_id, owner_user_id: user.id, session_name: name,
        status: "STARTING", engine: "NOWEB", updated_at: new Date().toISOString(),
      }, { onConflict: "session_name" });

      // создать (или перезапустить) сессию в WAHA
      const exists = await waha(`/api/sessions/${name}`);
      if (exists.status === 404) {
        await waha(`/api/sessions`, {
          method: "POST",
          body: JSON.stringify({ name, start: true, config: sessionConfig }),
        });
      } else {
        // обновить конфиг (store+webhook) и перезапустить
        await waha(`/api/sessions/${name}`, { method: "PUT", body: JSON.stringify({ config: sessionConfig }) });
        await waha(`/api/sessions/${name}/restart`, { method: "POST" });
      }
      return json({ ok: true, session: name });
    }

    if (op === "qr") {
      const res = await waha(`/api/${name}/auth/qr?format=image`);
      if (!res.ok) return json({ error: "QR недоступен (сессия ещё не готова)" }, 202);
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = ""; for (const b of buf) bin += String.fromCharCode(b);
      const b64 = btoa(bin);
      return json({ qr: `data:image/png;base64,${b64}` });
    }

    if (op === "status") {
      const res = await waha(`/api/sessions/${name}`);
      if (res.status === 404) return json({ status: "STOPPED" });
      const data = await res.json().catch(() => ({}));
      const status = data?.status ?? "UNKNOWN";
      const phone = data?.me?.id ? String(data.me.id).split("@")[0].split(":")[0] : null;
      await svc.from("waha_sessions").update({
        status, phone: phone ?? undefined, updated_at: new Date().toISOString(),
      }).eq("session_name", name);
      return json({ status, phone });
    }

    if (op === "logout") {
      await waha(`/api/sessions/${name}/logout`, { method: "POST" });
      await svc.from("waha_sessions").update({ status: "STOPPED", updated_at: new Date().toISOString() })
        .eq("session_name", name);
      return json({ ok: true });
    }

    return json({ error: "unknown op" }, 400);
  } catch (err) {
    console.error("[waha-sessions] error:", err);
    return json({ error: String(err) }, 500);
  }
});

/**
 * Edge Function: waha-sessions — управление номерами WhatsApp (WAHA) из фронта.
 *
 * Модель как у Wazzup: номер (сессия) — самостоятельная сущность, «ответственный»
 * (owner_user_id) назначается/переназначается отдельно. Прокси к WAHA API.
 *
 * Операции:
 *  - op=create  — новый номер: создать сессию в WAHA + запись waha_sessions, вернуть {session_id}
 *  - op=qr      — QR для привязки конкретной сессии (base64 data URL)
 *  - op=status  — статус сессии из WAHA (+ синк в БД)
 *  - op=assign  — назначить/сменить ответственного (owner_user_id)
 *  - op=logout  — отвязать номер (WAHA logout, статус STOPPED)
 *  - op=delete  — удалить номер (logout + удаление сессии из WAHA и записи)
 *
 * Авторизация: JWT + членство в воркспейсе.
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
function newSessionName(): string {
  const rnd = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.round(Math.random() * 1e9)}`)
    .replace(/-/g, "").slice(0, 16);
  return `waha${rnd}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!WAHA_URL || !WAHA_API_KEY) return json({ error: "WAHA не настроен" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { op?: string; workspace_id?: string; session_id?: string; owner_user_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { op, workspace_id, session_id } = body;
  if (!op || !workspace_id) return json({ error: "op/workspace_id required" }, 400);

  const svc = service();

  // Членство в воркспейсе
  const { data: member } = await svc.from("participants")
    .select("id").eq("user_id", user.id).eq("workspace_id", workspace_id)
    .eq("is_deleted", false).maybeSingle();
  if (!member) return json({ error: "Не участник воркспейса" }, 403);

  const webhookUrl = `${SUPABASE_URL}/functions/v1/waha-webhook?key=${WAHA_WEBHOOK_SECRET}`;
  const sessionConfig = {
    noweb: { store: { enabled: true, fullSync: true } },
    // message.revoked — удаление «для всех» (soft-delete в сервисе, 2026-07-23).
    // 🪤 У УЖЕ существующих сессий набор событий надо дозаливать вручную
    // (WAHA PUT /api/sessions/{name}) — конфиг применяется при создании.
    webhooks: [{ url: webhookUrl, events: ["message.any", "message.reaction", "message.ack", "message.revoked", "session.status"] }],
  };

  // Резолв имени сессии по session_id (с проверкой воркспейса)
  async function resolveName(): Promise<string | null> {
    if (!session_id) return null;
    const { data } = await svc.from("waha_sessions")
      .select("session_name").eq("id", session_id).eq("workspace_id", workspace_id).maybeSingle();
    return (data?.session_name as string) ?? null;
  }

  try {
    if (op === "create") {
      // Новый номер. Ответственный по умолчанию — создатель (переназначается потом).
      const name = newSessionName();
      const { data: inserted, error } = await svc.from("waha_sessions").insert({
        workspace_id, owner_user_id: user.id, session_name: name,
        status: "STARTING", engine: "NOWEB",
      }).select("id").single();
      if (error || !inserted) return json({ error: `db: ${error?.message}` }, 500);

      await waha(`/api/sessions`, {
        method: "POST",
        body: JSON.stringify({ name, start: true, config: sessionConfig }),
      });
      return json({ ok: true, session_id: inserted.id, session_name: name });
    }

    if (op === "assign") {
      if (!session_id) return json({ error: "session_id required" }, 400);
      // owner должен быть участником воркспейса (или null — снять)
      const newOwner = body.owner_user_id ?? null;
      if (newOwner) {
        const { data: ok } = await svc.from("participants")
          .select("id").eq("user_id", newOwner).eq("workspace_id", workspace_id)
          .eq("is_deleted", false).maybeSingle();
        if (!ok) return json({ error: "Ответственный не участник воркспейса" }, 400);
      }
      await svc.from("waha_sessions")
        .update({ owner_user_id: newOwner, updated_at: new Date().toISOString() })
        .eq("id", session_id).eq("workspace_id", workspace_id);
      return json({ ok: true });
    }

    const name = await resolveName();
    if (!name) return json({ error: "сессия не найдена" }, 404);

    if (op === "qr") {
      const res = await waha(`/api/${name}/auth/qr?format=image`);
      if (!res.ok) return json({ error: "QR недоступен (сессия ещё не готова)" }, 202);
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = ""; for (const b of buf) bin += String.fromCharCode(b);
      return json({ qr: `data:image/png;base64,${btoa(bin)}` });
    }

    if (op === "status") {
      const res = await waha(`/api/sessions/${name}`);
      if (res.status === 404) { await syncStatus(svc, session_id!, "STOPPED", null); return json({ status: "STOPPED" }); }
      const data = await res.json().catch(() => ({}));
      const status = data?.status ?? "UNKNOWN";
      const phone = data?.me?.id ? String(data.me.id).split("@")[0].split(":")[0] : null;
      await syncStatus(svc, session_id!, status, phone);
      return json({ status, phone });
    }

    if (op === "logout") {
      await waha(`/api/sessions/${name}/logout`, { method: "POST" });
      await syncStatus(svc, session_id!, "STOPPED", undefined);
      return json({ ok: true });
    }

    if (op === "delete") {
      await waha(`/api/sessions/${name}/logout`, { method: "POST" }).catch(() => {});
      await waha(`/api/sessions/${name}`, { method: "DELETE" }).catch(() => {});
      await svc.from("waha_sessions").delete().eq("id", session_id).eq("workspace_id", workspace_id);
      return json({ ok: true });
    }

    return json({ error: "unknown op" }, 400);
  } catch (err) {
    console.error("[waha-sessions] error:", err);
    return json({ error: String(err) }, 500);
  }
});

async function syncStatus(svc: SupabaseClient, sessionId: string, status: string, phone: string | null | undefined) {
  const upd: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (phone !== undefined) upd.phone = phone;
  await svc.from("waha_sessions").update(upd).eq("id", sessionId);
}

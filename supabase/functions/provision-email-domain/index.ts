/**
 * Edge Function: provision-email-domain
 *
 * По `workspace_id` поднимает email-инфраструктуру:
 *  1. Создаёт (или находит существующий) Resend Sender Domain `<slug>.clientcase.app`
 *     с включённым receiving.
 *  2. Получает 4 DNS-записи (DKIM, SPF MX, SPF TXT, Receiving MX) и upsert'ит их
 *     в зону `clientcase.app` через Cloudflare API.
 *  3. Просит Resend перепроверить домен.
 *  4. Обновляет в `workspaces`: email_resend_domain_id, флаги верификации,
 *     email_active = (overall verified).
 *
 * Идемпотентна — можно дёргать многократно для опроса статуса.
 *
 * Auth: пользовательский JWT, требуется чтобы юзер был владельцем воркспейса
 * (RPC is_workspace_owner).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { preflight, jsonRes, getUser, getServiceClient } from "../_shared/edge.ts";

const ROOT_DOMAIN = "clientcase.app";
const RESEND_API = "https://api.resend.com";
const CF_API = "https://api.cloudflare.com/client/v4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CLOUDFLARE_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") ?? "";
const CLOUDFLARE_ZONE_ID = Deno.env.get("CLOUDFLARE_ZONE_ID") ?? "";

interface ResendRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  status: string;
  priority?: number;
  ttl?: string;
}

interface ResendDomain {
  id: string;
  name: string;
  status: string;
  records: ResendRecord[];
  capabilities?: { sending?: string; receiving?: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405);

  if (!RESEND_API_KEY || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
    return jsonRes({ error: "server not configured" }, 500);
  }

  const user = await getUser(req);
  if (!user) return jsonRes({ error: "unauthorized" }, 401);

  let body: { workspace_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "invalid json" }, 400);
  }
  if (!body.workspace_id) return jsonRes({ error: "workspace_id required" }, 400);

  const service = getServiceClient();

  // Permission check — только владелец воркспейса
  const { data: isOwner } = await service.rpc("is_workspace_owner", {
    p_user_id: user.id,
    p_workspace_id: body.workspace_id,
  });
  if (!isOwner) return jsonRes({ error: "forbidden" }, 403);

  const { data: ws, error: wsErr } = await service
    .from("workspaces")
    .select("id, slug, is_deleted, email_resend_domain_id")
    .eq("id", body.workspace_id)
    .maybeSingle();
  if (wsErr || !ws) return jsonRes({ error: "workspace not found" }, 404);
  if (ws.is_deleted) return jsonRes({ error: "workspace deleted" }, 400);
  if (!ws.slug) return jsonRes({ error: "workspace has no slug" }, 400);
  if (!/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/.test(ws.slug)) {
    return jsonRes({ error: "slug must be DNS-safe (a-z, 0-9, hyphen)" }, 400);
  }

  const fullDomain = `${ws.slug}.${ROOT_DOMAIN}`;

  // Шаг 1: получить или создать Resend домен
  let domain: ResendDomain;
  if (ws.email_resend_domain_id) {
    domain = await resendGet(`/domains/${ws.email_resend_domain_id}`);
  } else {
    domain = await getOrCreateResendDomain(fullDomain);
    await service
      .from("workspaces")
      .update({ email_resend_domain_id: domain.id })
      .eq("id", ws.id);
  }

  // Шаг 2: убедиться что receiving включён
  if (domain.capabilities?.receiving !== "enabled") {
    await resendPatch(`/domains/${domain.id}`, {
      capabilities: { receiving: "enabled" },
    });
    domain = await resendGet(`/domains/${domain.id}`);
  }

  // Шаг 3: upsert DNS-записей в Cloudflare
  const dnsResults: { record: string; status: "created" | "updated" | "unchanged" | "error"; detail?: string }[] = [];
  for (const r of domain.records) {
    try {
      const result = await ensureCloudflareRecord(r);
      dnsResults.push({ record: r.record, status: result });
    } catch (e) {
      dnsResults.push({
        record: r.record,
        status: "error",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Шаг 4: попросить Resend перепроверить
  await resendPost(`/domains/${domain.id}/verify`, {});

  // Шаг 5: получить актуальный статус и обновить флаги
  const fresh = await resendGet<ResendDomain>(`/domains/${domain.id}`);
  const dkim = fresh.records.find((r) => r.record === "DKIM");
  const spfRecords = fresh.records.filter((r) => r.record === "SPF");
  const mx = fresh.records.find((r) => r.record === "Receiving");
  const dkimVerified = dkim?.status === "verified";
  const spfVerified = spfRecords.length > 0 && spfRecords.every((r) => r.status === "verified");
  const mxVerified = mx?.status === "verified";
  const allVerified = fresh.status === "verified";

  await service
    .from("workspaces")
    .update({
      email_dkim_verified: dkimVerified,
      email_return_path_verified: spfVerified,
      email_mx_verified: mxVerified,
      email_active: allVerified,
      email_activated_at: allVerified ? new Date().toISOString() : null,
    })
    .eq("id", ws.id);

  // Создать запись в workspace_email_settings, если ещё нет
  await service
    .from("workspace_email_settings")
    .upsert(
      { workspace_id: ws.id, inbox_address: `inbox@${fullDomain}` },
      { onConflict: "workspace_id", ignoreDuplicates: true },
    );

  return jsonRes({
    ok: true,
    domain: { id: fresh.id, name: fresh.name, overall_status: fresh.status },
    records: fresh.records.map((r) => ({
      record: r.record,
      name: r.name,
      type: r.type,
      status: r.status,
    })),
    dns_upsert: dnsResults,
    workspace: {
      email_active: allVerified,
      dkim_verified: dkimVerified,
      spf_verified: spfVerified,
      mx_verified: mxVerified,
    },
  });
});

// =====================================================================
// Resend API helpers
// =====================================================================

async function resendGet<T = ResendDomain>(path: string): Promise<T> {
  const res = await fetch(RESEND_API + path, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Resend GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return await res.json() as T;
}

async function resendPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(RESEND_API + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`Resend POST ${path} failed: ${res.status} ${await res.text()}`);
  }
  return await res.json().catch(() => ({}));
}

async function resendPatch(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(RESEND_API + path, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Resend PATCH ${path} failed: ${res.status} ${await res.text()}`);
  }
  return await res.json().catch(() => ({}));
}

async function getOrCreateResendDomain(name: string): Promise<ResendDomain> {
  // Сперва ищем существующий — Resend не возвращает специальную ошибку при дубле,
  // он создаёт новый, поэтому проверяем сначала список.
  const list = await resendGet<{ data: ResendDomain[] }>("/domains");
  const existing = list.data?.find((d) => d.name === name);
  if (existing) {
    return await resendGet(`/domains/${existing.id}`);
  }

  const created = await fetch(RESEND_API + "/domains", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, region: "eu-west-1" }),
  });
  if (!created.ok) {
    throw new Error(`Resend create domain failed: ${created.status} ${await created.text()}`);
  }
  return await created.json() as ResendDomain;
}

// =====================================================================
// Cloudflare API helpers
// =====================================================================

interface CFRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  priority?: number;
  ttl: number;
}

async function ensureCloudflareRecord(r: ResendRecord): Promise<"created" | "updated" | "unchanged"> {
  const fqdn = `${r.name}.${ROOT_DOMAIN}`;
  const type = r.type;
  const content = r.value;
  const priority = r.priority;

  const search = await cfFetch(
    `/zones/${CLOUDFLARE_ZONE_ID}/dns_records?type=${encodeURIComponent(type)}&name=${encodeURIComponent(fqdn)}`,
  );
  const existing = (search.result as CFRecord[]).find((rec) => sameContent(rec, content, priority));
  if (existing) return "unchanged";

  const sameNameAndType = (search.result as CFRecord[])[0];
  const payload: Record<string, unknown> = {
    type,
    name: fqdn,
    content,
    ttl: 1,
  };
  if (priority !== undefined) payload.priority = priority;

  if (sameNameAndType) {
    // Обновляем существующую запись (если есть запись с тем же name+type, но другим content)
    await cfFetch(`/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${sameNameAndType.id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    return "updated";
  }

  await cfFetch(`/zones/${CLOUDFLARE_ZONE_ID}/dns_records`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return "created";
}

function sameContent(rec: CFRecord, content: string, priority?: number): boolean {
  // CF возвращает TXT-content в кавычках или без — нормализуем
  const a = rec.content.replace(/^"(.*)"$/, "$1");
  const b = content.replace(/^"(.*)"$/, "$1");
  if (a !== b) return false;
  if (priority !== undefined && rec.priority !== priority) return false;
  return true;
}

async function cfFetch(path: string, init?: RequestInit): Promise<{ result: unknown; success: boolean; errors?: unknown[] }> {
  const res = await fetch(CF_API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(`CF ${path} failed: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
  }
  return json;
}

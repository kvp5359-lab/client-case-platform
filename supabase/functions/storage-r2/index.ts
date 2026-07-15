/**
 * storage-r2 — серверный посредник доступа к файлам в Cloudflare R2 (браузер).
 *
 * ЗАЧЕМ: у R2 нет RLS. Секретные S3-ключи в браузер класть нельзя. Поэтому
 * фронт не ходит в R2 напрямую, а зовёт эту функцию — она (1) проверяет права
 * пользователя (зеркало storage-RLS Supabase), (2) выдаёт временную presigned-
 * ссылку прямо в R2 (браузер уже качает/льёт напрямую, минуя нас — без лимита
 * на размер edge-функции).
 *
 * Модель доступа (точная копия storage.objects RLS на 2026-07-11):
 *   - Workspace-бакеты (files, document-files, document-templates,
 *     message-attachments): первая папка пути = workspace_id, пользователь
 *     обязан быть активным участником этого воркспейса.
 *   - Auth-бакеты (docbuilder, docbuilder-covers, docbuilder-screenshots,
 *     participant-avatars): достаточно быть залогиненным.
 *
 * Операции (POST JSON): sign_get | sign_put | remove | list.
 * verify_jwt = true — нужен Bearer пользователя.
 *
 * Самодостаточна (без ../_shared) — чтобы деплоиться одним файлом.
 */

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;

// ── CORS (зеркало _shared/cors.ts) ─────────────────────────────────────────
const STATIC_ALLOWED = ["https://my.clientcase.app", "https://clientcase.app"];
const WS_SUBDOMAIN_RE = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.clientcase\.app$/;
const LOCALHOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const envAllowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim());
  const allowed =
    STATIC_ALLOWED.includes(origin) ||
    WS_SUBDOMAIN_RE.test(origin) ||
    LOCALHOST_RE.test(origin) ||
    envAllowed.includes(origin);
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  if (allowed && origin) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Vary"] = "Origin";
  }
  return h;
}
function jsonRes(payload: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

// ── Бакеты ──────────────────────────────────────────────────────────────────
const WORKSPACE_BUCKETS = new Set([
  "files",
  "document-files",
  "document-templates",
  "message-attachments",
]);
const AUTH_BUCKETS = new Set([
  "docbuilder",
  "docbuilder-covers",
  "docbuilder-screenshots",
  "participant-avatars",
]);
// Бакеты, куда RLS Supabase разрешает ЗАПИСЬ только service_role (нет
// authenticated-политики INSERT/UPDATE/DELETE). storage-r2 не должен выдавать
// presigned PUT/DELETE обычному залогиненному — иначе расширяет права против RLS.
// Чтение (публичное) идёт по public-URL, не через эту функцию.
const WRITE_SERVICE_ONLY = new Set(["docbuilder-screenshots"]);

const r2 = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});

function workspaceOf(path: string): string | null {
  const first = path.replace(/^\/+/, "").split("/")[0];
  return /^[0-9a-f-]{36}$/i.test(first) ? first : null;
}

function objectUrl(bucket: string, path: string): string {
  // filter(Boolean) схлопывает пустые сегменты (напр. `<ws>//<msg>` из личных
  // диалогов без проекта): rclone при копировании тоже схлопнул `//`→`/`, и
  // запись через r2Upload обязана класть по тому же ключу.
  const key = path.replace(/^\/+/, "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `${R2_ENDPOINT}/${bucket}/${key}`;
}

async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const client: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await client.auth.getUser();
  return user?.id ?? null;
}

async function canAccess(
  userId: string,
  bucket: string,
  path: string,
  service: SupabaseClient,
  wsCache: Map<string, boolean>,
): Promise<boolean> {
  if (AUTH_BUCKETS.has(bucket)) return true;
  if (!WORKSPACE_BUCKETS.has(bucket)) return false;
  const ws = workspaceOf(path);
  if (!ws) return false;
  if (wsCache.has(ws)) return wsCache.get(ws)!;
  const { data } = await service
    .from("participants")
    .select("workspace_id")
    .eq("user_id", userId)
    .eq("workspace_id", ws)
    .eq("is_deleted", false)
    .limit(1);
  const ok = !!(data && data.length > 0);
  wsCache.set(ws, ok);
  return ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonRes({ error: "method_not_allowed" }, 405, req);

  const userId = await getUserId(req);
  if (!userId) return jsonRes({ error: "unauthorized" }, 401, req);

  let body: {
    op?: string;
    bucket?: string;
    path?: string;
    paths?: string[];
    prefix?: string;
    expiresIn?: number;
    download?: string | boolean;
    inline?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "bad_json" }, 400, req);
  }

  const { op, bucket } = body;
  if (!op || !bucket) return jsonRes({ error: "missing_op_or_bucket" }, 400, req);
  if (!WORKSPACE_BUCKETS.has(bucket) && !AUTH_BUCKETS.has(bucket)) {
    return jsonRes({ error: "unknown_bucket" }, 400, req);
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const wsCache = new Map<string, boolean>();

  try {
    switch (op) {
      case "sign_get":
      case "sign_put": {
        const path = body.path ?? "";
        if (!path) return jsonRes({ error: "missing_path" }, 400, req);
        if (op === "sign_put" && WRITE_SERVICE_ONLY.has(bucket)) {
          return jsonRes({ error: "forbidden" }, 403, req);
        }
        if (!(await canAccess(userId, bucket, path, service, wsCache))) {
          return jsonRes({ error: "forbidden" }, 403, req);
        }
        const method = op === "sign_get" ? "GET" : "PUT";
        const expires = Math.min(Math.max(body.expiresIn ?? 3600, 60), 60 * 60 * 24 * 7);
        const url = new URL(objectUrl(bucket, path));
        url.searchParams.set("X-Amz-Expires", String(expires));
        // Зеркало Supabase `createSignedUrl({ download })`: заставляем R2 отдать файл
        // как вложение с человеческим именем (S3 override response-content-disposition).
        // Параметр включается в подпись (signQuery), поэтому подделать нельзя.
        //
        // `inline` — тот же override, но disposition=inline: файл открывается прямо
        // во вкладке (PDF/картинка), а имя всё равно человеческое. Без него браузер
        // берёт имя из URL (у blob-ссылки это UUID) — см. openDocumentInNewTab.
        // `download` (скачать) имеет приоритет над `inline` (открыть).
        if (op === "sign_get" && (body.download || body.inline)) {
          const disposition = body.download ? "attachment" : "inline";
          // `||`, не `??`: при download=false нужен inline-режим и его имя
          // (`??` вернул бы false и имя молча взялось бы из пути = UUID).
          const explicit = body.download || body.inline;
          const name = typeof explicit === "string" ? explicit : path.split("/").pop() ?? "file";
          url.searchParams.set(
            "response-content-disposition",
            `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
          );
        }
        const signed = await r2.sign(new Request(url.toString(), { method }), {
          aws: { signQuery: true },
        });
        return jsonRes({ url: signed.url }, 200, req);
      }

      case "remove": {
        if (WRITE_SERVICE_ONLY.has(bucket)) {
          return jsonRes({ error: "forbidden" }, 403, req);
        }
        const paths = body.paths ?? (body.path ? [body.path] : []);
        if (!paths.length) return jsonRes({ error: "missing_paths" }, 400, req);
        for (const p of paths) {
          if (!(await canAccess(userId, bucket, p, service, wsCache))) {
            return jsonRes({ error: "forbidden", path: p }, 403, req);
          }
        }
        const results: { path: string; ok: boolean }[] = [];
        for (const p of paths) {
          const res = await r2.fetch(objectUrl(bucket, p), { method: "DELETE" });
          results.push({ path: p, ok: res.ok || res.status === 404 });
        }
        return jsonRes({ results }, 200, req);
      }

      case "list": {
        const prefix = (body.prefix ?? "").replace(/^\/+/, "");
        if (WORKSPACE_BUCKETS.has(bucket)) {
          if (!(await canAccess(userId, bucket, prefix, service, wsCache))) {
            return jsonRes({ error: "forbidden" }, 403, req);
          }
        }
        const url = new URL(`${R2_ENDPOINT}/${bucket}`);
        url.searchParams.set("list-type", "2");
        if (prefix) url.searchParams.set("prefix", prefix);
        const res = await r2.fetch(url.toString(), { method: "GET" });
        const xml = await res.text();
        const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
        return jsonRes({ keys }, 200, req);
      }

      default:
        return jsonRes({ error: "unknown_op" }, 400, req);
    }
  } catch (e) {
    return jsonRes({ error: "internal", detail: String(e) }, 500, req);
  }
});

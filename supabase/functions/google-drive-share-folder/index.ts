/**
 * Edge Function: google-drive-share-folder
 *
 * Actions:
 * - "list": вернуть текущие доступы папки (permissions.list) — кто уже имеет доступ
 * - "revoke": снять доступ по permissionId (permissions.delete)
 * - default: выдать доступ к папке списку email (permissions.create, type=user,
 *   БЕЗ письма-уведомления от Google — sendNotificationEmail=false)
 *
 * Auth: verify_jwt=true (только фронт) → getUser → членство в воркспейсе →
 * Google-токен вызывающего из google_drive_tokens. Делиться может только
 * аккаунт, у которого есть право шарить папку (обычно владелец/создатель).
 *
 * Body: { workspaceId, folderId, action?: "list", emails?: string[], role?: "reader" | "writer" }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
import { getValidAccessTokenForUser } from "../_shared/googleDriveToken.ts";
import {
  grantFilePermission,
  listFilePermissions,
  deleteFilePermission,
} from "../_shared/googleDriveHelpers.ts";
import { isValidUUID, isValidGoogleDriveId } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";

const LOG_PREFIX = "[google-drive-share-folder]";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = new Set(["reader", "writer"]);
const MAX_EMAILS = 50;

function json(payload: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

const KNOWN_ERRORS = ["Google Drive not connected", "insufficient_permissions", "folder_not_found"];

function errorCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  return KNOWN_ERRORS.includes(raw) ? raw : "internal_error";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeadersFor(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401, req);
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return json({ error: "Unauthorized" }, 401, req);
    }

    const body = await req.json();
    const { workspaceId, folderId, action } = body ?? {};

    if (!workspaceId || !isValidUUID(workspaceId)) {
      return json({ error: "workspaceId is required" }, 400, req);
    }
    if (!folderId || !isValidGoogleDriveId(folderId)) {
      return json({ error: "Invalid folderId" }, 400, req);
    }

    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, workspaceId);
    if (!isMember) {
      return json({ error: "Access denied" }, 403, req);
    }

    const accessToken = await getValidAccessTokenForUser(supabaseAdmin, user.id);

    // =========================================================================
    // ACTION: list — текущие доступы папки
    // =========================================================================
    if (action === "list") {
      const permissions = await listFilePermissions(folderId, accessToken);
      return json({ permissions }, 200, req);
    }

    // =========================================================================
    // ACTION: revoke — снять доступ по permissionId
    // =========================================================================
    if (action === "revoke") {
      const { permissionId } = body ?? {};
      if (typeof permissionId !== "string" || !/^[\w-]{1,128}$/.test(permissionId)) {
        return json({ error: "Invalid permissionId" }, 400, req);
      }
      await deleteFilePermission(folderId, permissionId, accessToken);
      console.log(`${LOG_PREFIX} Revoked permission ${permissionId} on ${folderId}`);
      return json({ success: true }, 200, req);
    }

    // =========================================================================
    // DEFAULT: выдать доступ списку email (без письма-уведомления)
    // =========================================================================
    const { emails, role } = body ?? {};

    if (!Array.isArray(emails) || emails.length === 0 || emails.length > MAX_EMAILS) {
      return json({ error: "emails must be a non-empty array" }, 400, req);
    }
    const cleaned = emails
      .filter((e: unknown): e is string => typeof e === "string")
      .map((e: string) => e.trim())
      .filter((e: string) => EMAIL_RE.test(e));
    if (cleaned.length === 0) {
      return json({ error: "No valid emails" }, 400, req);
    }
    if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) {
      return json({ error: "Invalid role" }, 400, req);
    }

    const granted: string[] = [];
    const failed: Array<{ email: string; error: string }> = [];

    // Последовательно — уважая rate limits Drive API (как batch в create-folder).
    for (const email of cleaned) {
      try {
        await grantFilePermission(folderId, email, role as "reader" | "writer", accessToken);
        granted.push(email);
      } catch (err) {
        console.error(`${LOG_PREFIX} Failed to grant to ${email}:`, err);
        failed.push({ email, error: errorCode(err) });
      }
    }

    console.log(`${LOG_PREFIX} Granted ${role} on ${folderId}: ok=${granted.length} fail=${failed.length}`);

    return json({ success: failed.length === 0, granted, failed }, 200, req);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);

    const code = errorCode(error);
    // Известные ошибки отдаём 200 { error } — supabase.functions.invoke на
    // non-2xx прячет тело ответа, а фронту нужен код для человеческого текста.
    if (code !== "internal_error") {
      return json({ error: code }, 200, req);
    }
    return json({ error: "Internal server error" }, 500, req);
  }
});

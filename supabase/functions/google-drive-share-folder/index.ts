/**
 * Edge Function: google-drive-share-folder
 *
 * Выдаёт доступ к папке Google Drive конкретному email (Drive API
 * permissions.create, type=user). Google сам шлёт письмо-приглашение.
 *
 * Auth: verify_jwt=true (только фронт) → getUser → членство в воркспейсе →
 * Google-токен вызывающего из google_drive_tokens. Делиться может только
 * аккаунт, у которого есть право шарить папку (обычно владелец/создатель).
 *
 * Body: { workspaceId, folderId, email, role: "reader" | "writer" }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
import { getValidAccessTokenForUser } from "../_shared/googleDriveToken.ts";
import { grantFilePermission } from "../_shared/googleDriveHelpers.ts";
import { isValidUUID, isValidGoogleDriveId } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";

const LOG_PREFIX = "[google-drive-share-folder]";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = new Set(["reader", "writer"]);

function json(payload: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
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
    const { workspaceId, folderId, email, role } = body ?? {};

    if (!workspaceId || !isValidUUID(workspaceId)) {
      return json({ error: "workspaceId is required" }, 400, req);
    }
    if (!folderId || !isValidGoogleDriveId(folderId)) {
      return json({ error: "Invalid folderId" }, 400, req);
    }
    if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
      return json({ error: "Invalid email" }, 400, req);
    }
    if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) {
      return json({ error: "Invalid role" }, 400, req);
    }

    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, workspaceId);
    if (!isMember) {
      return json({ error: "Access denied" }, 403, req);
    }

    const accessToken = await getValidAccessTokenForUser(supabaseAdmin, user.id);

    const permissionId = await grantFilePermission(
      folderId,
      email.trim(),
      role as "reader" | "writer",
      accessToken,
    );

    console.log(`${LOG_PREFIX} Granted ${role} on ${folderId} (permission ${permissionId})`);

    return json({ success: true, permissionId }, 200, req);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);

    const raw = error instanceof Error ? error.message : "";
    const known = ["Google Drive not connected", "insufficient_permissions", "folder_not_found"];
    // Известные ошибки отдаём 200 { error } — supabase.functions.invoke на
    // non-2xx прячет тело ответа, а фронту нужен код для человеческого текста.
    const message = known.includes(raw) ? raw : "Internal server error";
    const status = message === "Internal server error" ? 500 : 200;

    return json({ error: message }, status, req);
  }
});

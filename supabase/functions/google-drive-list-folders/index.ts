import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
import { ensureValidAccessToken } from "../_shared/googleDriveToken.ts";
import { isValidGoogleDriveId, isValidUUID } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";

/**
 * Возвращает структуру папки Google Drive для создания набора документов:
 * имя корневой папки + подпапки ПЕРВОГО уровня (id, name).
 * Рекурсию и файлы НЕ трогает — файлы зеркалятся отдельно (source sync).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeadersFor(req) });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Service role — для доступа к токенам в обход RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { folderId, workspaceId } = await req.json();

    if (!folderId || typeof folderId !== "string" || !isValidGoogleDriveId(folderId)) {
      return json({ error: "Invalid or missing folderId" }, 400);
    }
    if (!workspaceId || !isValidUUID(workspaceId)) {
      return json({ error: "workspaceId is required" }, 400);
    }

    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, workspaceId);
    if (!isMember) {
      return json({ error: "Access denied" }, 403);
    }

    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from("google_drive_tokens")
      .select("user_id, access_token, refresh_token, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return json({ error: "Google Drive not connected", code: "NOT_CONNECTED" }, 401);
    }

    const accessToken = await ensureValidAccessToken(supabaseAdmin, {
      user_id: user.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
    });

    // Имя корневой папки + проверка, что это папка и не в корзине
    const rootResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,trashed&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!rootResponse.ok) {
      if (rootResponse.status === 404) {
        return json({ error: "Папка не найдена", code: "NOT_FOUND" }, 404);
      }
      const errorText = await rootResponse.text();
      console.error("Google Drive API error (root):", rootResponse.status, errorText);
      return json({ error: "Не удалось получить папку из Google Drive" }, 502);
    }

    const rootData = await rootResponse.json();
    if (rootData.trashed) {
      return json({ error: "Папка находится в корзине", code: "TRASHED" }, 400);
    }
    if (rootData.mimeType !== "application/vnd.google-apps.folder") {
      return json({ error: "Указанная ссылка ведёт не на папку", code: "NOT_A_FOLDER" }, 400);
    }

    // Подпапки первого уровня
    const listResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)&orderBy=name&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error("Google Drive API error (list):", listResponse.status, errorText);
      return json({ error: "Не удалось получить подпапки из Google Drive" }, 502);
    }

    const listData = await listResponse.json();
    const folders: Array<{ id: string; name: string }> = (listData.files || []).map(
      (f: { id: string; name: string }) => ({ id: f.id, name: f.name })
    );

    return json({
      folderId,
      folderName: rootData.name ?? null,
      folders,
    });
  } catch (error) {
    console.error("List folders error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});

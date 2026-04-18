import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { ensureValidAccessToken } from "../_shared/googleDriveToken.ts";
import { isValidGoogleDriveId, isValidUUID } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Service role client для доступа к токенам в обход RLS
    const supabaseServiceRole = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    const { folderId, workspaceId } = await req.json();

    if (!folderId || typeof folderId !== "string" || !isValidGoogleDriveId(folderId)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing folderId" }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Z8-09: workspace membership is required
    if (!workspaceId || !isValidUUID(workspaceId)) {
      return new Response(
        JSON.stringify({ error: "workspaceId is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const isMember = await checkWorkspaceMembership(supabaseServiceRole, user.id, workspaceId);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Всегда используем токен только текущего пользователя (Z8-25: безопасность)
    const { data: tokenData } = await supabaseServiceRole
      .from("google_drive_tokens")
      .select("user_id, access_token, refresh_token, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!tokenData) {
      return new Response(
        JSON.stringify({ error: "Google Drive not connected", code: "NOT_CONNECTED" }),
        {
          status: 401,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    const accessToken = await ensureValidAccessToken(supabaseServiceRole, {
      user_id: tokenData.user_id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
    });

    // Get folder info from Google Drive
    const folderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,trashed&supportsAllDrives=true`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!folderResponse.ok) {
      if (folderResponse.status === 404) {
        return new Response(
          JSON.stringify({ exists: false, error: "Folder not found" }),
          {
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          }
        );
      }
      const errorText = await folderResponse.text();
      console.error("Google Drive API error:", folderResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to get folder info from Google Drive" }),
        {
          status: 502,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    const folderData = await folderResponse.json();

    return new Response(
      JSON.stringify({
        exists: !folderData.trashed,
        name: folderData.name,
        id: folderData.id,
        isFolder: folderData.mimeType === "application/vnd.google-apps.folder",
      }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Get folder name error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
      }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
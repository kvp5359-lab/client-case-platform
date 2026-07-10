import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
import { ensureValidAccessToken } from "../_shared/googleDriveToken.ts";
import { isValidGoogleDriveId, isValidUUID } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { getDriveFolderName, listDriveFilesRecursive } from "../_shared/googleDriveFiles.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeadersFor(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
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

    // Service role client для безопасного доступа к токенам
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
      );
    }

    const { folderId, workspaceId, groupByTopLevel } = await req.json();

    if (!folderId || typeof folderId !== "string" || !isValidGoogleDriveId(folderId)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing folderId" }),
        { status: 400, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
      );
    }

    // Z8-08: workspace membership is required
    if (!workspaceId || !isValidUUID(workspaceId)) {
      return new Response(
        JSON.stringify({ error: "workspaceId is required" }),
        { status: 400, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
      );
    }

    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, workspaceId);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
      );
    }

    // Get Google Drive token via service role
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from("google_drive_tokens")
      .select("user_id, access_token, refresh_token, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: "Google Drive not connected" }),
        {
          status: 401,
          headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
        }
      );
    }

    const accessToken = await ensureValidAccessToken(supabaseAdmin, {
      user_id: user.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
    });

    // Рекурсивный обход папки и подпапок + имя корневой папки — общий helper
    // (тот же, что использует серверная авто-проверка sync-source-documents).
    const allFiles = await listDriveFilesRecursive(accessToken, folderId, !!groupByTopLevel);
    const rootFolderName = await getDriveFolderName(accessToken, folderId);

    return new Response(
      JSON.stringify({
        files: allFiles,
        folderName: rootFolderName,
      }),
      {
        headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("List files error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
      }
    );
  }
});
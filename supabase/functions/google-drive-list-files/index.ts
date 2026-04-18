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

    // Service role client для безопасного доступа к токенам
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const { folderId, workspaceId } = await req.json();

    if (!folderId || typeof folderId !== "string" || !isValidGoogleDriveId(folderId)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing folderId" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Z8-08: workspace membership is required
    if (!workspaceId || !isValidUUID(workspaceId)) {
      return new Response(
        JSON.stringify({ error: "workspaceId is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, workspaceId);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
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
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    const accessToken = await ensureValidAccessToken(supabaseAdmin, {
      user_id: user.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
    });

    // Типы Google Drive API
    interface DriveFile {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      createdTime?: string;
      modifiedTime?: string;
      webViewLink?: string;
      iconLink?: string;
      parents?: string[];
      parentFolderName?: string;
    }

    // Рекурсивная функция для получения всех файлов из папки и подпапок (Z8-20, Z8-21)
    const MAX_DEPTH = 5;
    const MAX_FILES = 500;
    const getAllFilesRecursively = async (parentFolderId: string, parentFolderName: string = "", depth: number = 0): Promise<DriveFile[]> => {
      if (depth >= MAX_DEPTH) return [];
      const allFiles: DriveFile[] = [];
      
      // Получаем содержимое папки (файлы и подпапки)
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${parentFolderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,iconLink,parents)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Google Drive API error:", errorText);
        throw new Error("Failed to get files from Google Drive");
      }

      const data = await response.json();
      const items = data.files || [];

      // Разделяем файлы и папки
      const files = items.filter((item: DriveFile) => item.mimeType !== 'application/vnd.google-apps.folder');
      const folders = items.filter((item: DriveFile) => item.mimeType === 'application/vnd.google-apps.folder');

      // Добавляем файлы с информацией о родительской папке
      for (const file of files) {
        allFiles.push({
          ...file,
          parentFolderName: parentFolderName || "Корневая папка"
        });
      }

      // Рекурсивно обходим подпапки (с лимитом глубины и файлов)
      for (const folder of folders) {
        if (allFiles.length >= MAX_FILES) break;
        const subFiles = await getAllFilesRecursively(folder.id, folder.name, depth + 1);
        allFiles.push(...subFiles);
      }

      return allFiles;
    };

    // Получаем название корневой папки
    let rootFolderName: string | null = null;
    try {
      const folderResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (folderResponse.ok) {
        const folderData = await folderResponse.json();
        rootFolderName = folderData.name || null;
      }
    } catch {
      // Не критично — название папки необязательно
    }

    // Получаем все файлы рекурсивно
    const allFiles = await getAllFilesRecursively(folderId);

    return new Response(
      JSON.stringify({
        files: allFiles,
        folderName: rootFolderName,
      }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("List files error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
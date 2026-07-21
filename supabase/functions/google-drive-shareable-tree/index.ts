import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
import { ensureValidAccessToken } from "../_shared/googleDriveToken.ts";
import { isValidUUID } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";

/**
 * Реальная структура папок проекта на Google Drive для вкладки «Внешние»
 * пикера ссылок. В отличие от get_project_shareable_resources (строит дерево
 * из связей в БД, которые могут расходиться с Диском), эта функция читает
 * ЖИВУЮ структуру: рекурсивно обходит папки под корневой папкой проекта и
 * находит реальную папку, где лежит бриф.
 *
 * Возвращает плоский список узлов { kind, id, parent_id, label, url } —
 * дерево фронт собирает по parent_id (корень = parent_id null).
 * Файлы (кроме брифа) НЕ листаем — пикер вставляет ссылки на папки и бриф.
 */

const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_FOLDERS = 300; // страховка от гигантских деревьев
const MAX_DEPTH = 6;

type DriveFolder = { id: string; name: string };
type Node = {
  kind: "drive_folder" | "brief";
  id: string;
  parent_id: string | null;
  label: string;
  /** Доп. подпись серым (реальное имя папки Диска у корня). */
  sub_label?: string | null;
  url: string;
};

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
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

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
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { projectId } = await req.json();
    if (!projectId || !isValidUUID(projectId)) {
      return json({ error: "projectId is required" }, 400);
    }

    // Проект: корневая папка + воркспейс + брифы
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("workspace_id, google_drive_folder_link")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return json({ error: "project not found" }, 404);

    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, project.workspace_id);
    if (!isMember) return json({ error: "Access denied" }, 403);

    const rootId = extractDriveFolderId(project.google_drive_folder_link);
    if (!rootId) {
      // Корневой папки нет — рисовать нечего (фронт покажет пусто/фолбэк).
      return json({ ok: true, nodes: [] });
    }

    // Токен Google Drive текущего пользователя
    const { data: tokenData } = await supabaseAdmin
      .from("google_drive_tokens")
      .select("user_id, access_token, refresh_token, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!tokenData) {
      return json({ error: "Google Drive not connected", code: "NOT_CONNECTED" }, 401);
    }
    const accessToken = await ensureValidAccessToken(supabaseAdmin, {
      user_id: user.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
    });

    const drive = async (url: string) => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`drive ${res.status}: ${await res.text()}`);
      return res.json();
    };

    // Имя корня
    const rootMeta = await drive(
      `https://www.googleapis.com/drive/v3/files/${rootId}?fields=id,name,trashed&supportsAllDrives=true`,
    ).catch(() => null);
    if (!rootMeta || rootMeta.trashed) {
      return json({ ok: true, nodes: [] });
    }

    const nodes: Node[] = [
      {
        kind: "drive_folder",
        id: rootId,
        parent_id: null,
        label: "Папка проекта на Google Диске",
        sub_label: (rootMeta.name as string)?.trim() || null,
        url: driveFolderUrl(rootId),
      },
    ];
    const knownFolderIds = new Set<string>([rootId]);

    // Рекурсивный (BFS) обход подпапок с ограничением глубины и количества
    let frontier: string[] = [rootId];
    let depth = 0;
    while (frontier.length > 0 && depth < MAX_DEPTH && knownFolderIds.size < MAX_FOLDERS) {
      const next: string[] = [];
      for (const parent of frontier) {
        if (knownFolderIds.size >= MAX_FOLDERS) break;
        const list = await drive(
          `https://www.googleapis.com/drive/v3/files?q='${parent}'+in+parents+and+mimeType='${FOLDER_MIME}'+and+trashed=false` +
            `&fields=files(id,name)&orderBy=name&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        ).catch(() => ({ files: [] }));
        for (const f of (list.files ?? []) as DriveFolder[]) {
          if (knownFolderIds.has(f.id)) continue;
          knownFolderIds.add(f.id);
          nodes.push({
            kind: "drive_folder",
            id: f.id,
            parent_id: parent,
            label: f.name || "Папка",
            url: driveFolderUrl(f.id),
          });
          next.push(f.id);
        }
      }
      frontier = next;
      depth += 1;
    }

    // Брифы проекта → реальная родительская папка каждого
    const { data: kits } = await supabaseAdmin
      .from("form_kits")
      .select("name, brief_sheet_id")
      .eq("project_id", projectId)
      .not("brief_sheet_id", "is", null);

    for (const k of kits ?? []) {
      const sheetId = k.brief_sheet_id as string;
      const meta = await drive(
        `https://www.googleapis.com/drive/v3/files/${sheetId}?fields=id,name,parents&supportsAllDrives=true`,
      ).catch(() => null);
      const parent = (meta?.parents?.[0] as string | undefined) ?? null;
      // Родитель в дереве проекта → под него; иначе (бриф вне дерева) — под корень.
      const parentId = parent && knownFolderIds.has(parent) ? parent : rootId;
      nodes.push({
        kind: "brief",
        id: `brief:${sheetId}`,
        parent_id: parentId,
        label: `${(k.name as string)?.trim() || "Бриф"} (бриф)`,
        url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
      });
    }

    return json({ ok: true, nodes });
  } catch (error) {
    console.error("google-drive-shareable-tree error:", error);
    return json({ error: "Не удалось прочитать структуру Google Drive" }, 500);
  }
});

function driveFolderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

/** Вытащить id папки из ссылки Google Drive (folders/<id> или ?id=<id>). */
function extractDriveFolderId(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = link.match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

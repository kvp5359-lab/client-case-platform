/**
 * Серверная авто-проверка источников Google Drive (ежечасный pg_cron).
 * Обходит ВСЕ источники (document_sources) живых проектов, на каждую папку
 * подбирает токен сотрудника воркспейса (сначала «кто подключил», затем любой
 * с подключённым Drive; протух/нет доступа — следующий; никто — пропуск),
 * листает Drive и upsert'ит в source_documents. Логика зеркалит ручной синк
 * (sourceDocumentService.syncSourceDocumentsFromDrive), но created_at при
 * обновлении НЕ трогается — это стабильная метка «файл впервые появился»,
 * на которой держится бейдж непрочитанного.
 *
 * Авторизация: только по x-internal-secret (зовёт pg_cron через net.http_post).
 * Деплой: --no-verify-jwt (пользовательского JWT нет).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  getServiceClient,
  jsonRes,
  preflight,
  requireInternalSecret,
} from "../_shared/edge.ts";
import { ensureValidAccessToken } from "../_shared/googleDriveToken.ts";
import { listDriveFilesRecursive } from "../_shared/googleDriveFiles.ts";

interface DocumentSourceRow {
  id: string;
  project_id: string;
  workspace_id: string;
  document_kit_id: string | null;
  drive_folder_id: string;
  name: string | null;
  connected_by_user_id: string | null;
}

interface TokenRow {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

const CONCURRENCY = 6;

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!requireInternalSecret(req)) return jsonRes({ error: "unauthorized" }, 401, req);

  const service = getServiceClient();

  // Опционально ограничить одним воркспейсом.
  let onlyWorkspaceId: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.workspaceId === "string") onlyWorkspaceId = body.workspaceId;
  } catch {
    // тело необязательно
  }

  // Финальные статусы проектов (Завершён/Отменён) — их проекты не сканируем.
  const { data: finalStatuses } = await service
    .from("statuses")
    .select("id")
    .eq("entity_type", "project")
    .eq("is_final", true);
  const finalStatusIds = new Set((finalStatuses ?? []).map((s: { id: string }) => s.id));

  // Источники живых проектов «в работе» (не в финальном статусе).
  let query = service
    .from("document_sources")
    .select(
      "id, project_id, workspace_id, document_kit_id, drive_folder_id, name, connected_by_user_id, projects!inner(is_deleted, status_id)",
    )
    .eq("projects.is_deleted", false);
  if (onlyWorkspaceId) query = query.eq("workspace_id", onlyWorkspaceId);
  const { data: sources, error: srcErr } = await query;
  if (srcErr) return jsonRes({ error: srcErr.message }, 500, req);

  const allSources = ((sources ?? []) as Array<
    DocumentSourceRow & { projects?: { status_id: string | null } | { status_id: string | null }[] }
  >)
    .filter((r) => {
      const proj = Array.isArray(r.projects) ? r.projects[0] : r.projects;
      const sid = proj?.status_id ?? null;
      return !sid || !finalStatusIds.has(sid);
    }) as unknown as DocumentSourceRow[];

  // Кэш кандидатов-токенов по воркспейсу + первый сработавший юзер.
  const tokenCache = new Map<string, TokenRow[]>();
  const workingUser = new Map<string, string>();
  const tokenLoads = new Map<string, Promise<TokenRow[]>>();

  const loadWorkspaceTokens = (workspaceId: string): Promise<TokenRow[]> => {
    const inflight = tokenLoads.get(workspaceId);
    if (inflight) return inflight;
    const p = (async () => {
      const { data: members } = await service
        .from("participants")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("is_deleted", false)
        .not("user_id", "is", null);
      const userIds = [
        ...new Set((members ?? []).map((m) => m.user_id).filter(Boolean)),
      ] as string[];
      let rows: TokenRow[] = [];
      if (userIds.length > 0) {
        const { data: tokens } = await service
          .from("google_drive_tokens")
          .select("user_id, access_token, refresh_token, expires_at")
          .in("user_id", userIds);
        rows = (tokens ?? []) as TokenRow[];
      }
      tokenCache.set(workspaceId, rows);
      return rows;
    })();
    tokenLoads.set(workspaceId, p);
    return p;
  };

  let filesFound = 0;
  let deleted = 0;
  let synced = 0;
  let skipped = 0;

  const syncOne = async (s: DocumentSourceRow): Promise<void> => {
    const groupByTopLevel = !!s.document_kit_id;
    const tokens = await loadWorkspaceTokens(s.workspace_id);
    if (tokens.length === 0) {
      skipped++;
      return;
    }

    // Порядок кандидатов: уже сработавший в воркспейсе → кто подключил → остальные.
    const ordered: TokenRow[] = [];
    const pushCandidate = (uid: string | null | undefined) => {
      if (!uid) return;
      const t = tokens.find((x) => x.user_id === uid);
      if (t && !ordered.includes(t)) ordered.push(t);
    };
    pushCandidate(workingUser.get(s.workspace_id));
    pushCandidate(s.connected_by_user_id);
    for (const t of tokens) if (!ordered.includes(t)) ordered.push(t);

    // Принимаем ПЕРВЫЙ НЕПУСТОЙ листинг: непустой = у токена есть доступ к папке.
    // Пустой результат неотличим от «нет доступа» → откладываем: по нему НИЧЕГО
    // не удаляем и токен не кэшируем (иначе чужой токен без доступа стёр бы
    // зеркало папки целиком).
    let files: Awaited<ReturnType<typeof listDriveFilesRecursive>> | null = null;
    let usedUser: string | null = null;
    let sawEmpty = false;
    for (const t of ordered) {
      try {
        const accessToken = await ensureValidAccessToken(service, t);
        const listed = await listDriveFilesRecursive(
          accessToken,
          s.drive_folder_id,
          groupByTopLevel,
        );
        if (listed.length > 0) {
          files = listed;
          usedUser = t.user_id;
          break;
        }
        sawEmpty = true; // токен ответил, но папка пуста ЛИБО нет доступа
      } catch {
        // токен протух / ошибка — следующий кандидат
      }
    }

    if (!files || !usedUser) {
      // Ни один токен не дал непустой листинг. Если хоть один вернул пусто —
      // НЕ удаляем (папка могла быть недоступна токену); никто не ответил → пропуск.
      if (!sawEmpty) skipped++;
      return;
    }
    workingUser.set(s.workspace_id, usedUser);

    // Самолечение: фиксируем, чей токен реально видит эту папку (для будущих синков).
    if (!s.connected_by_user_id) {
      service
        .from("document_sources")
        .update({ connected_by_user_id: usedUser })
        .eq("id", s.id)
        .then(() => {}, () => {});
    }

    // Upsert (без created_at → у существующих строк метка первого появления цела).
    const rows = files.map((f) => ({
      project_id: s.project_id,
      workspace_id: s.workspace_id,
      document_kit_id: s.document_kit_id,
      source_id: s.id,
      google_drive_file_id: f.id,
      name: f.name,
      mime_type: f.mimeType,
      file_size: f.size ? parseInt(f.size) : null,
      parent_folder_name: f.parentFolderName,
      parent_drive_folder_id: f.parentFolderId ? f.parentFolderId : null,
      web_view_link: f.webViewLink,
      icon_link: f.iconLink,
      created_time: f.createdTime,
      modified_time: f.modifiedTime,
      synced_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error: upErr } = await service
        .from("source_documents")
        .upsert(rows, { onConflict: "project_id,google_drive_file_id", ignoreDuplicates: false });
      if (upErr) {
        console.error("[sync-source-documents] upsert", s.id, upErr.message);
        skipped++;
        return;
      }
    }

    // Удаление файлов, которых больше нет в Drive (в скоупе источника).
    const present = new Set(files.map((f) => f.id));
    const { data: existing } = await service
      .from("source_documents")
      .select("id, google_drive_file_id")
      .eq("source_id", s.id);
    const toDelete = (existing ?? [])
      .filter((d) => !present.has(d.google_drive_file_id))
      .map((d) => d.id);
    if (toDelete.length > 0) {
      await service.from("source_documents").delete().in("id", toDelete);
      deleted += toDelete.length;
    }

    filesFound += files.length;
    synced++;
  };

  // Пул параллелизма (чтобы уложиться в таймаут функции на десятках источников).
  let cursor = 0;
  const worker = async () => {
    while (cursor < allSources.length) {
      const idx = cursor++;
      try {
        await syncOne(allSources[idx]);
      } catch (e) {
        console.error("[sync-source-documents]", allSources[idx]?.id, e instanceof Error ? e.message : e);
        skipped++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allSources.length) }, worker));

  return jsonRes({ total: allSources.length, synced, skipped, filesFound, deleted }, 200, req);
});

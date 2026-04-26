// generate-project-digest
//
// Делает сводку активности по одному проекту за указанный период.
// Источники: audit_logs (статусы, документы, задачи, поля), project_messages, comments.
// Если событий меньше workspace_digest_settings.min_events_for_llm — формирует
// человеко-читаемый список без LLM. Иначе — зовёт Anthropic/Gemini через общий хелпер.
//
// Идемпотентность: upsert по (project_id, period_start, period_end, digest_type).
// Тайм-зона: Europe/Madrid (если period_start/period_end не переданы — считаем "сегодня по Мадриду").

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/validation.ts";
import { setupAiChat, callAiApi } from "../_shared/ai-chat-setup.ts";

const TIMEZONE = "Europe/Madrid";
const COALESCE_GAP_MINUTES = 30;

const DEFAULT_SYSTEM_PROMPT = `Ты — помощник, который делает короткие деловые сводки дня по проекту в юридической CRM.
Тебе передадут:
- название и тип проекта,
- список участников,
- хронологический список событий за период (сообщения, изменения статусов задач, документы, участники, заполнение анкет, комментарии).

Сделай сводку на русском языке в таком формате:

1. Один-три абзаца человеческого пересказа: что главное произошло за день, в каком состоянии проект сейчас, есть ли ожидания от клиента или команды.
2. Пустая строка.
3. Маркированный список из 3-7 пунктов с ключевыми событиями (короткие фразы).

Не выдумывай события, опирайся только на переданный список.
Не повторяй имена участников и точные временные метки в абзацах — пиши естественно.
Если событий мало, не нагоняй воды — короткая сводка лучше длинной.`;

interface DigestRequest {
  workspace_id: string;
  project_id: string;
  period_start?: string; // YYYY-MM-DD
  period_end?: string;   // YYYY-MM-DD
  digest_type?: "day" | "week" | "month" | "custom";
  override_prompt?: string;
  test_run?: boolean;
  force?: boolean;
}

interface CollectedEvent {
  ts: string;       // ISO timestamp
  kind: string;     // 'message' | 'status' | 'document' | 'task' | 'participant' | 'form' | 'comment' | ...
  actor: string;    // human-readable name
  text: string;     // pre-formatted human-readable summary
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Returns YYYY-MM-DD for "today" in Europe/Madrid. */
function todayInMadrid(): string {
  // sv-SE locale renders ISO-like "YYYY-MM-DD HH:mm:ss".
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

/**
 * Returns UTC timestamp range for [start, end] dates interpreted in Europe/Madrid.
 * Madrid is UTC+1 (CET) or UTC+2 (CEST). We compute exact offset using Intl.
 */
function madridDayRangeUtc(periodStart: string, periodEnd: string): { gte: string; lt: string } {
  const startUtc = madridDateToUtc(periodStart, "00:00:00");
  // exclusive end = day after periodEnd at 00:00 Madrid
  const next = nextDay(periodEnd);
  const endUtc = madridDateToUtc(next, "00:00:00");
  return { gte: startUtc, lt: endUtc };
}

function nextDay(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function madridDateToUtc(date: string, time: string): string {
  // Trick: build a fake "as if UTC" timestamp, then ask Intl what time it shows in Madrid,
  // and compute the offset to invert.
  const naive = new Date(`${date}T${time}Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(naive);
  const get = (t: string) => parts.find(p => p.type === t)?.value || "00";
  const madridShown = new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
  );
  const offsetMs = madridShown.getTime() - naive.getTime();
  return new Date(naive.getTime() - offsetMs).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(req, { error: "Missing authorization header" }, 401);

    const body = (await req.json()) as DigestRequest;
    const { workspace_id, project_id } = body;

    if (!workspace_id || !project_id) {
      return jsonResponse(req, { error: "workspace_id and project_id are required" }, 400);
    }
    if (!isValidUUID(workspace_id) || !isValidUUID(project_id)) {
      return jsonResponse(req, { error: "workspace_id and project_id must be valid UUIDs" }, 400);
    }

    const today = todayInMadrid();
    const periodStart = body.period_start || today;
    const periodEnd = body.period_end || periodStart;
    const digestType: "day" | "week" | "month" | "custom" = body.digest_type || "day";

    // Set up auth + AI client (we may not actually call AI — it's still cheap to set up).
    const setup = await setupAiChat(req, authHeader, workspace_id);
    if (setup instanceof Response) return setup;

    const { user, supabaseServiceRole, aiProvider, apiKey, geminiThinkingBudget } = setup;

    // Verify project belongs to workspace.
    const { data: project, error: projErr } = await supabaseServiceRole
      .from("projects")
      .select("id, name, workspace_id, template_id")
      .eq("id", project_id)
      .eq("workspace_id", workspace_id)
      .single<{ id: string; name: string; workspace_id: string; template_id: string | null }>();
    if (projErr || !project) {
      console.error("Project lookup failed:", { project_id, workspace_id, projErr, project });
      return jsonResponse(req, {
        error: "Project not found in this workspace",
        debug: { project_id, workspace_id, projErr: projErr?.message ?? null },
      }, 404);
    }

    // Load workspace digest settings (or fall back to defaults).
    const { data: settingsRow } = await supabaseServiceRole
      .from("workspace_digest_settings")
      .select("system_prompt, min_events_for_llm, model")
      .eq("workspace_id", workspace_id)
      .maybeSingle<{ system_prompt: string | null; min_events_for_llm: number; model: string }>();

    const systemPrompt = body.override_prompt
      || settingsRow?.system_prompt
      || DEFAULT_SYSTEM_PROMPT;
    const minEventsForLlm = settingsRow?.min_events_for_llm ?? 5;
    const modelOverride = settingsRow?.model;

    // If exists and !force and !test_run — return existing.
    if (!body.force && !body.test_run) {
      const { data: existing } = await supabaseServiceRole
        .from("project_digests")
        .select("*")
        .eq("project_id", project_id)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .eq("digest_type", digestType)
        .maybeSingle();
      if (existing) {
        return jsonResponse(req, { digest: existing, reused: true });
      }
    }

    // ── Collect events ──────────────────────────────────────────────────────
    const range = madridDayRangeUtc(periodStart, periodEnd);
    const events = await collectEvents(supabaseServiceRole, project_id, range);

    // Empty period → don't create empty digest.
    if (events.length === 0) {
      return jsonResponse(req, {
        digest: null,
        reused: false,
        skipped_reason: "no_activity",
      });
    }

    // ── Decide mode ─────────────────────────────────────────────────────────
    let content: string;
    let mode: "auto_list" | "llm";
    let usedModel: string | null = null;

    if (events.length < minEventsForLlm) {
      content = renderAutoList(events, project.name);
      mode = "auto_list";
    } else {
      // Build user message for LLM.
      const participants = await fetchParticipantNames(supabaseServiceRole, project_id);
      const userMessage = buildLlmUserMessage(project.name, participants, events, periodStart, periodEnd);
      const model = modelOverride || setup.aiModel;
      const llmResult = await callAiApi(req, {
        apiKey,
        model,
        systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 1200,
        geminiThinkingBudget,
      });
      if (llmResult instanceof Response) return llmResult;
      content = llmResult.answer.trim();
      mode = "llm";
      usedModel = `${aiProvider}:${model}`;
    }

    const eventsCount = events.length;

    // ── Save (unless test run) ──────────────────────────────────────────────
    if (body.test_run) {
      return jsonResponse(req, {
        digest: {
          content,
          events_count: eventsCount,
          generation_mode: mode,
          model: usedModel,
          raw_events: events,
          period_start: periodStart,
          period_end: periodEnd,
          digest_type: digestType,
          project_id,
          workspace_id,
        },
        reused: false,
        test_run: true,
      });
    }

    const { data: saved, error: saveErr } = await supabaseServiceRole
      .from("project_digests")
      .upsert({
        workspace_id,
        project_id,
        period_start: periodStart,
        period_end: periodEnd,
        digest_type: digestType,
        content,
        raw_events: events,
        events_count: eventsCount,
        generation_mode: mode,
        model: usedModel,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,period_start,period_end,digest_type" })
      .select("*")
      .single();

    if (saveErr) {
      console.error("Failed to save digest:", saveErr);
      return jsonResponse(req, { error: "Failed to save digest" }, 500);
    }

    return jsonResponse(req, { digest: saved, reused: false });
  } catch (err) {
    console.error("generate-project-digest error:", err);
    return jsonResponse(req, { error: "Internal error" }, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Event collection
// ──────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function collectEvents(supabase: any, projectId: string, range: { gte: string; lt: string }): Promise<CollectedEvent[]> {
  const events: CollectedEvent[] = [];

  // 1. project_messages — переписка по тредам.
  const { data: messages } = await supabase
    .from("project_messages")
    .select("id, thread_id, sender_name, sender_role, channel, content, has_attachments, created_at")
    .eq("project_id", projectId)
    .gte("created_at", range.gte)
    .lt("created_at", range.lt)
    .order("created_at", { ascending: true });

  // Coalesce consecutive messages from same (thread_id, sender_name) within COALESCE_GAP_MINUTES.
  type Msg = { id: string; thread_id: string | null; sender_name: string | null; sender_role: string | null; channel: string | null; content: string | null; has_attachments: boolean | null; created_at: string };
  const groups: Msg[][] = [];
  for (const m of (messages as Msg[] || [])) {
    const last = groups[groups.length - 1];
    const lastMsg = last?.[last.length - 1];
    const sameSender = lastMsg && lastMsg.thread_id === m.thread_id && lastMsg.sender_name === m.sender_name;
    const closeInTime = lastMsg && (new Date(m.created_at).getTime() - new Date(lastMsg.created_at).getTime()) <= COALESCE_GAP_MINUTES * 60 * 1000;
    if (sameSender && closeInTime) {
      last.push(m);
    } else {
      groups.push([m]);
    }
  }
  for (const g of groups) {
    const first = g[0];
    const channelLabel = first.channel === "email" ? "почта" : first.channel === "telegram" ? "telegram" : "чат";
    const previewParts: string[] = [];
    let totalLen = 0;
    for (const m of g) {
      if (!m.content) continue;
      const piece = m.content.length > 200 ? m.content.slice(0, 200) + "…" : m.content;
      previewParts.push(piece);
      totalLen += piece.length;
      if (totalLen > 600) break;
    }
    const attachmentNote = g.some((m) => m.has_attachments) ? " (с вложениями)" : "";
    const countNote = g.length > 1 ? ` [${g.length} сообщ.]` : "";
    events.push({
      ts: first.created_at,
      kind: "message",
      actor: first.sender_name || "—",
      text: `[${channelLabel}${countNote}] ${first.sender_name || "—"}${attachmentNote}: ${previewParts.join(" / ")}`,
    });
  }

  // 2. audit_logs — статусы, документы, задачи, участники, поля анкет.
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("user_id, action, resource_type, details, created_at")
    .eq("project_id", projectId)
    .gte("created_at", range.gte)
    .lt("created_at", range.lt)
    .order("created_at", { ascending: true });

  // Resolve actor names from participants by user_id (within the project's workspace).
  const userIds = Array.from(new Set((logs || []).map((l: { user_id: string | null }) => l.user_id).filter(Boolean))) as string[];
  const actorMap = await fetchActorNames(supabase, userIds);

  // Collect status IDs to resolve.
  const statusIds = new Set<string>();
  for (const l of (logs || []) as Array<{ action: string; details: Record<string, unknown> | null }>) {
    if (l.action === "change_status" && l.details && typeof l.details === "object") {
      for (const k of ["new_status", "old_status"]) {
        const v = (l.details as Record<string, unknown>)[k];
        if (typeof v === "string" && isValidUUID(v)) statusIds.add(v);
      }
    }
  }
  const statusMap = await fetchStatusNames(supabase, Array.from(statusIds));

  for (const l of (logs || []) as Array<{ user_id: string | null; action: string; resource_type: string; details: Record<string, unknown> | null; created_at: string }>) {
    const actor = (l.user_id && actorMap.get(l.user_id)) || "—";
    const text = formatAuditEvent(l.action, l.resource_type, l.details, statusMap);
    if (!text) continue;
    events.push({
      ts: l.created_at,
      kind: classifyAuditKind(l.resource_type),
      actor,
      text: `${actor}: ${text}`,
    });
  }

  // 3. comments — комментарии.
  const { data: comments } = await supabase
    .from("comments")
    .select("created_by, entity_type, content, is_resolved, created_at")
    .eq("project_id", projectId)
    .gte("created_at", range.gte)
    .lt("created_at", range.lt)
    .order("created_at", { ascending: true });

  const commentUserIds = Array.from(new Set((comments || []).map((c: { created_by: string | null }) => c.created_by).filter(Boolean))) as string[];
  const commentActorMap = await fetchActorNames(supabase, commentUserIds);
  for (const c of (comments || []) as Array<{ created_by: string | null; entity_type: string; content: string | null; is_resolved: boolean; created_at: string }>) {
    const actor = (c.created_by && commentActorMap.get(c.created_by)) || "—";
    const preview = (c.content || "").length > 250 ? (c.content || "").slice(0, 250) + "…" : (c.content || "");
    events.push({
      ts: c.created_at,
      kind: "comment",
      actor,
      text: `${actor} оставил комментарий к ${c.entity_type}: ${preview}`,
    });
  }

  // Sort merged events by timestamp.
  events.sort((a, b) => a.ts.localeCompare(b.ts));
  return events;
}

function classifyAuditKind(resource: string): string {
  if (resource === "task") return "task";
  if (resource === "project") return "project";
  if (resource === "document" || resource === "folder" || resource === "document_kit") return "document";
  if (resource === "form_kit") return "form";
  if (resource === "project_participant") return "participant";
  if (resource === "thread") return "thread";
  return "other";
}

function formatAuditEvent(
  action: string,
  resource: string,
  details: Record<string, unknown> | null,
  statusMap: Map<string, string>,
): string | null {
  const name = (details?.name as string) || "";
  const human = (s: string) => s.replace(/_/g, " ");

  if (action === "change_status" && resource === "task") {
    const newId = details?.new_status as string | undefined;
    const oldId = details?.old_status as string | undefined;
    const newS = (newId && statusMap.get(newId)) || newId || "—";
    const oldS = (oldId && statusMap.get(oldId)) || oldId || "—";
    return `задача "${name}": статус ${oldS} → ${newS}`;
  }
  if (action === "change_status" && resource === "project") {
    const newS = (details?.new_status as string) || "—";
    const oldS = (details?.old_status as string) || "—";
    return `проект "${name}": статус ${oldS} → ${newS}`;
  }
  if (action === "change_status" && resource === "document") {
    return `документ "${name}": статус изменён`;
  }
  if (action === "change_deadline" && resource === "task") {
    const nd = details?.new_deadline as string | null;
    const od = details?.old_deadline as string | null;
    if (nd && !od) return `задача "${name}": установлен дедлайн ${nd.slice(0, 10)}`;
    if (!nd && od) return `задача "${name}": снят дедлайн`;
    return `задача "${name}": дедлайн изменён → ${nd?.slice(0, 10) || "—"}`;
  }
  if (action === "create") return `создан ${human(resource)} "${name}"`;
  if (action === "rename") return `переименован ${human(resource)} → "${name}"`;
  if (action === "delete" || action === "soft_delete") return `удалён ${human(resource)} "${name}"`;
  if (action === "restore") return `восстановлен ${human(resource)} "${name}"`;
  if (action === "download") return `скачан документ "${name}"`;
  if (action === "batch_download") return `массовое скачивание документов`;
  if (action === "batch_delete") return `массовое удаление документов`;
  if (action === "add_participant") return `добавлен участник "${name}"`;
  if (action === "remove_participant") return `удалён участник "${name}"`;
  if (action === "update_roles") return `обновлены роли участника "${name}"`;
  if (action === "fill_field" && resource === "form_kit") {
    const field = (details?.field_name as string) || "поле";
    return `заполнено поле "${field}" в анкете "${name}"`;
  }
  if (action === "update_field" && resource === "form_kit") {
    const field = (details?.field_name as string) || "поле";
    return `обновлено поле "${field}" в анкете "${name}"`;
  }
  if (action === "change_settings") return `изменены настройки ${human(resource)} "${name}"`;
  if (action === "pin") return `закреплён ${human(resource)} "${name}"`;
  if (action === "unpin") return `откреплён ${human(resource)} "${name}"`;
  return null;
}

// deno-lint-ignore no-explicit-any
async function fetchActorNames(supabase: any, userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const { data } = await supabase
    .from("participants")
    .select("user_id, full_name, email")
    .in("user_id", userIds)
    .eq("is_deleted", false);
  for (const p of (data || []) as Array<{ user_id: string; full_name: string | null; email: string | null }>) {
    if (!map.has(p.user_id)) {
      map.set(p.user_id, p.full_name || p.email || p.user_id.slice(0, 6));
    }
  }
  return map;
}

// deno-lint-ignore no-explicit-any
async function fetchStatusNames(supabase: any, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("statuses")
    .select("id, name")
    .in("id", ids);
  for (const s of (data || []) as Array<{ id: string; name: string }>) {
    map.set(s.id, s.name);
  }
  return map;
}

// deno-lint-ignore no-explicit-any
async function fetchParticipantNames(supabase: any, projectId: string): Promise<string[]> {
  const { data } = await supabase
    .from("project_participants")
    .select("participant:participants(full_name, email, is_deleted)")
    .eq("project_id", projectId);
  const names: string[] = [];
  for (const row of (data || []) as Array<{ participant: { full_name: string | null; email: string | null; is_deleted: boolean } | null }>) {
    const p = row.participant;
    if (!p || p.is_deleted) continue;
    const name = p.full_name || p.email;
    if (name) names.push(name);
  }
  return names;
}

// ──────────────────────────────────────────────────────────────────────────────
// Output formatting
// ──────────────────────────────────────────────────────────────────────────────

function renderAutoList(events: CollectedEvent[], projectName: string): string {
  const lines = [`Активность по проекту "${projectName}" — событий мало, привожу как есть:`, ""];
  for (const e of events) {
    const time = new Date(e.ts).toLocaleTimeString("ru-RU", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" });
    lines.push(`- ${time} — ${e.text}`);
  }
  return lines.join("\n");
}

function buildLlmUserMessage(
  projectName: string,
  participants: string[],
  events: CollectedEvent[],
  periodStart: string,
  periodEnd: string,
): string {
  const period = periodStart === periodEnd ? `за ${periodStart}` : `с ${periodStart} по ${periodEnd}`;
  const lines: string[] = [
    `Проект: "${projectName}"`,
    participants.length ? `Участники проекта: ${participants.join(", ")}` : "",
    `Период: ${period} (Europe/Madrid)`,
    "",
    "События в хронологическом порядке:",
  ].filter(Boolean);
  for (const e of events) {
    const time = new Date(e.ts).toLocaleString("ru-RU", {
      timeZone: TIMEZONE,
      hour: "2-digit", minute: "2-digit",
      day: "2-digit", month: "2-digit",
    });
    lines.push(`- [${time}] ${e.text}`);
  }
  lines.push("", "Сделай сводку по правилам из системного промпта.");
  return lines.join("\n");
}

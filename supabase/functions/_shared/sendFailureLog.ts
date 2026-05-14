/**
 * Server-side helper для записи в `message_send_failures` из edge-функций
 * отправки (telegram-send-message, telegram-business-send, wazzup-send и т.п.).
 *
 * Используется когда внешний API (Telegram Bot API, Wazzup, …) вернул не-2xx —
 * на фронте этого случая по другому не поймать (INSERT в `project_messages`
 * прошёл успешно, mutation `useSendMessage` уже завершилась без onError).
 *
 * Принимает только id сообщения + текст ошибки + источник; всё остальное
 * (workspace_id, user_id, participant_id, content, project_id, thread_id)
 * подгружает из `project_messages` join'ом на participants/projects.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface ServerSendFailureParams {
  message_id: string;
  error_text: string;
  error_code?: string | null;
  source: string;
  integration_id?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logServerSendFailure(
  service: SupabaseClient,
  params: ServerSendFailureParams,
): Promise<void> {
  try {
    // Подгружаем контекст одной выборкой. participant.user_id даёт нам
    // автора сообщения в терминах auth.users; project.workspace_id нужен
    // и для RLS-фильтра, и для realtime-подписки на фронте.
    const { data: msg, error } = await service
      .from("project_messages")
      .select(
        "id, project_id, thread_id, content, sender_participant_id, " +
          "participant:participants!sender_participant_id ( user_id ), " +
          "project:projects ( workspace_id )",
      )
      .eq("id", params.message_id)
      .maybeSingle();
    if (error || !msg) return;

    // Если пришли через триггер БД (без auth.users), authenticatedUserId
    // отсутствует — берём user_id из participant'а отправителя.
    const userId =
      (msg as unknown as { participant?: { user_id?: string | null } }).participant?.user_id ?? null;
    const workspaceId =
      (msg as unknown as { project?: { workspace_id?: string | null } }).project?.workspace_id ?? null;
    if (!userId || !workspaceId) return;

    // Дедуп: если за последние 5 минут уже есть незакрытая запись для
    // того же message_id (через metadata->>project_message_id), не плодим
    // дубли — например, при ретраях внутри одной отправки.
    const { data: existing } = await service
      .from("message_send_failures")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .filter("metadata->>project_message_id", "eq", params.message_id)
      .is("resolved_at", null)
      .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();
    if (existing) return;

    await service.from("message_send_failures").insert({
      workspace_id: workspaceId,
      project_id: msg.project_id ?? null,
      thread_id: msg.thread_id ?? null,
      user_id: userId,
      participant_id: msg.sender_participant_id ?? null,
      content: msg.content ?? null,
      error_text: params.error_text.slice(0, 2000),
      error_code: params.error_code ?? null,
      source: params.source,
      integration_id: params.integration_id ?? null,
      metadata: { project_message_id: params.message_id, ...(params.metadata ?? {}) },
    });
  } catch (err) {
    // Сам логгер падать не должен — ему всегда есть лучшее место в console.
    console.warn("[sendFailureLog] insert failed:", err);
  }
}

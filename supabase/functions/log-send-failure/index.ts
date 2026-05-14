/**
 * Edge Function: log-send-failure
 *
 * Записывает в `message_send_failures` факт неудачной отправки сообщения.
 * Вызывается с фронта из `onError` мутации `useSendMessage` (и других мест,
 * где есть отправка наружу).
 *
 * Логика серверная, потому что:
 *  - INSERT в таблицу не положить с фронта (RLS закрыт для public по INSERT)
 *  - валидируем доступ юзера к воркспейсу через RLS user-client'а
 *  - можно расширять (нотификации в Telegram, Slack-вебхуки и т.п.)
 *
 * Auth: требует валидный Bearer-JWT пользователя (verify_jwt=true).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  preflight,
  jsonRes,
  getUser,
  getServiceClient,
} from "../_shared/edge.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";

interface RequestBody {
  workspace_id: string;
  project_id?: string | null;
  thread_id?: string | null;
  participant_id?: string | null;
  content?: string | null;
  attachment_names?: string[] | null;
  error_text: string;
  error_code?: string | null;
  source?: string | null;
  integration_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await getUser(req);
  if (!user) return jsonRes({ error: "Unauthorized" }, 401, req);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "Invalid JSON" }, 400, req);
  }

  if (!body.workspace_id || typeof body.workspace_id !== "string") {
    return jsonRes({ error: "workspace_id is required" }, 400, req);
  }
  if (!body.error_text || typeof body.error_text !== "string") {
    return jsonRes({ error: "error_text is required" }, 400, req);
  }

  const service = getServiceClient();

  // Юзер должен быть участником этого воркспейса. Иначе — потенциальный
  // прокси-абьюз (логирование «как будто» отправки, к которой нет доступа).
  const isMember = await checkWorkspaceMembership(service, user.id, body.workspace_id);
  if (!isMember) return jsonRes({ error: "Access denied" }, 403, req);

  // Подрезаем content до разумной длины — длинные тексты редкость, но защитимся
  // от случайной мегапейстенки (хранение и realtime-payload).
  const MAX_CONTENT = 50_000;
  const content = body.content && body.content.length > MAX_CONTENT
    ? body.content.slice(0, MAX_CONTENT) + "…"
    : body.content ?? null;

  const { data: row, error } = await service
    .from("message_send_failures")
    .insert({
      workspace_id: body.workspace_id,
      project_id: body.project_id ?? null,
      thread_id: body.thread_id ?? null,
      user_id: user.id,
      participant_id: body.participant_id ?? null,
      content,
      attachment_names: body.attachment_names ?? null,
      error_text: body.error_text.slice(0, 2000),
      error_code: body.error_code ?? null,
      source: body.source ?? null,
      integration_id: body.integration_id ?? null,
      metadata: body.metadata ?? null,
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("log-send-failure insert error:", error);
    return jsonRes({ error: "Failed to log failure" }, 500, req);
  }

  return jsonRes({ ok: true, id: row.id, created_at: row.created_at }, 200, req);
});

/**
 * Тонкий клиент для edge-функции `log-send-failure`.
 *
 * Регистрирует факт неудачной отправки сообщения в server-side журнале
 * `message_send_failures`. Realtime-подписка на эту таблицу в WorkspaceLayout
 * показывает пользователю sticky-toast «У вас не отправилось …» с кнопкой
 * «Открыть чат» — даже если он успел уйти из чата, перезагрузил страницу
 * или зашёл с другого устройства.
 *
 * Вызывается fire-and-forget: если сам лог-вызов упадёт, мы не делаем
 * ничего страшного — основная ошибка отправки уже показана локальным toast.
 */

import { supabase } from '@/lib/supabase'

export interface SendFailurePayload {
  workspace_id: string
  project_id?: string | null
  thread_id?: string | null
  participant_id?: string | null
  content?: string | null
  attachment_names?: string[] | null
  error_text: string
  error_code?: string | null
  source?: string | null
  integration_id?: string | null
  metadata?: Record<string, unknown> | null
}

export async function logSendFailure(payload: SendFailurePayload): Promise<void> {
  const { error } = await supabase.functions.invoke('log-send-failure', {
    body: payload,
  })
  if (error) {
    throw error
  }
}

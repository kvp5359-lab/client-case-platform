/**
 * Доставка ВЛОЖЕНИЙ письма — единственная точка на все три пути отправки:
 * обычная отправка (`messengerService.send`), публикация черновика
 * (`messengerDraftService.publishDraft`) и повтор (`useRetryTelegramSend`).
 *
 * Почему отдельно от остальных каналов: серверный диспетчер
 * `dispatch_message_to_channels` email-ветку с `has_attachments` пропускает
 * (RETURN) даже при force — иначе письмо ушло бы дважды, ведь публикация
 * черновика уже шлёт его фронт-invoke'ом. Значит вложения письма может довезти
 * ТОЛЬКО фронт.
 *
 * Раньше этот блок был скопирован в трёх местах и успел разъехаться: разный
 * набор колонок в SELECT, разная обработка ошибок, и ни одна копия не
 * передавала `hasEmailInternalMessage` — а сервер считает тред почтовым ещё и
 * по наличию входящего письма (см. миграцию 20260721140000). Из-за этого для
 * части тредов повтор молча не срабатывал.
 */

import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { logSendFailure } from './logSendFailure'
import { resolveThreadChannel, type ThreadChannelSignals } from './resolveThreadChannel'

/** Колонки треда, по которым `resolveThreadChannel` определяет канал. */
const THREAD_CHANNEL_COLUMNS =
  'type, email_send_account_id, wazzup_channel_id, wazzup_chat_id, waha_session_id, waha_chat_id, mtproto_session_user_id, mtproto_client_tg_user_id, business_connection_id'

/**
 * Почтовый ли тред — теми же признаками, что и серверный диспетчер:
 * `type='email'` ИЛИ привязан Gmail-аккаунт ИЛИ в треде уже есть входящее
 * письмо (`source='email_internal'`).
 */
export async function isEmailChannelThread(threadId: string): Promise<boolean> {
  const { data: thread } = await supabase
    .from('project_threads')
    .select(THREAD_CHANNEL_COLUMNS)
    .eq('id', threadId)
    .maybeSingle()

  const signals = (thread as ThreadChannelSignals) ?? {}
  const byColumns = resolveThreadChannel(signals)
  if (byColumns === 'email') return true
  // У треда есть привязка к другому каналу (Wazzup/MTProto/Business/Telegram) —
  // входящих писем в нём быть не может, второй запрос не нужен.
  if (byColumns !== 'internal') return false

  // Тред без единой внешней привязки: он всё ещё может быть почтовым — сервер
  // считает так и по наличию входящего письма (миграция 20260721140000).
  // Именно этот случай раньше терялся, и повтор отправки молча ничего не делал.
  const { count } = await supabase
    .from('project_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .eq('source', 'email_internal')

  return (count ?? 0) > 0
}

export type DeliverEmailAttachmentsParams = {
  messageId: string
  workspaceId: string
  projectId?: string | null
  threadId: string
  senderParticipantId?: string | null
  content?: string | null
  attachmentNames?: string[]
}

/**
 * Дослать вложения письма. Ошибку не бросает: логирует в `message_send_failures`
 * (это даёт sticky-toast даже закрывшему вкладку) и возвращает признак успеха —
 * вызывающий сам решает, что делать со статусом сообщения.
 */
export async function deliverEmailAttachments(
  params: DeliverEmailAttachmentsParams,
): Promise<{ ok: boolean; error?: unknown }> {
  await supabase.auth.getSession().catch(() => {})
  try {
    const { data, error } = await supabase.functions.invoke('email-internal-send', {
      body: { message_id: params.messageId },
    })
    if (error) throw error
    // Функция отвечает 200 и на отказ (напр. файл пропал из хранилища) —
    // invoke такое не бросает, поэтому разбираем тело.
    const payload = data as { ok?: boolean; error?: string } | null
    if (payload && payload.ok === false) {
      throw new Error(payload.error || 'email-internal-send returned ok:false')
    }
    return { ok: true }
  } catch (err) {
    logger.error('Failed to send email attachments:', err)
    void logSendFailure({
      workspace_id: params.workspaceId,
      project_id: params.projectId ?? null,
      thread_id: params.threadId,
      participant_id: params.senderParticipantId ?? null,
      content: params.content ?? null,
      attachment_names: params.attachmentNames ?? [],
      error_text: err instanceof Error ? err.message : String(err),
      error_code: 'email_send_invoke_failed',
      source: 'email',
      metadata: { stage: 'email_internal_send_invoke' },
    })
    return { ok: false, error: err }
  }
}

/**
 * ЕДИНЫЙ источник правды «в какой внешний канал идёт этот тред» (для отправки
 * и публикации). Раньше маршрутизация жила в трёх несинхронных представлениях
 * (SQL-триггер dispatch_message_to_channels, ad-hoc if/else в send.ts,
 * resolveMessageChannelKind в удалении) — порядок веток совпадал вручную, и
 * расхождение = доставка не в тот канал. Теперь одна функция с КАНОНИЧЕСКИМ
 * порядком, идентичным SQL-триггеру.
 *
 * Порядок веток (как в dispatch_message_to_channels): email → mtproto →
 * business → wazzup → telegram_group → internal. Треды одноканальны (поля
 * взаимоисключающие по конструкции), поэтому для реального треда результат не
 * зависит от порядка; канон нужен, чтобы три слоя не разъезжались, и как
 * защита, если тред когда-нибудь получит два признака.
 *
 * Резолвер по КОНФИГУ треда (pre-send: «куда пойдёт»). Не путать с
 * resolveMessageChannelKind — тот резолвит по ФАКТУ отправки (проставленные
 * external id, post-send: «куда ушло», для удаления).
 */
export type OutgoingChannelKind =
  | 'email'
  | 'mtproto'
  | 'business'
  | 'wazzup'
  | 'telegram_group'
  | 'internal'

export type ThreadChannelSignals = {
  /** project_threads.type ('email' → email-тред). */
  type?: string | null
  /** Привязка к Gmail-аккаунту (email-тред). */
  email_send_account_id?: string | null
  /**
   * В треде уже есть входящее email_internal-сообщение (как в SQL-триггере).
   * Опционально — если не передан, email определяется по type/account_id.
   */
  hasEmailInternalMessage?: boolean
  mtproto_session_user_id?: string | null
  mtproto_client_tg_user_id?: number | string | null
  business_connection_id?: string | null
  wazzup_channel_id?: string | null
  wazzup_chat_id?: string | null
  /** Есть активная привязка project_telegram_chats (групповой бот). */
  hasTelegramGroupChat?: boolean
}

export function resolveThreadChannel(s: ThreadChannelSignals): OutgoingChannelKind {
  if (s.type === 'email' || !!s.email_send_account_id || s.hasEmailInternalMessage === true) {
    return 'email'
  }
  if (s.mtproto_session_user_id && s.mtproto_client_tg_user_id) return 'mtproto'
  if (s.business_connection_id) return 'business'
  if (s.wazzup_channel_id && s.wazzup_chat_id) return 'wazzup'
  if (s.hasTelegramGroupChat === true) return 'telegram_group'
  return 'internal'
}

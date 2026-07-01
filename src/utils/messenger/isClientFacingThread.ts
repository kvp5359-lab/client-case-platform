/**
 * Единый предикат «клиентский (внешний) тред» — есть ли с кем переписываться
 * как с клиентом. ОДНО определение для всех мест, чтобы они не расходились
 * (раньше композер и раскраска баблов считали по-разному → баг с MTProto:
 * командные сообщения не красились в серый).
 *
 * Тред считается клиентским, если верно ЛЮБОЕ:
 *  - в проекте есть участник с ролью «Клиент», имеющий доступ к треду;
 *  - подключён групповой Telegram-бот (TG-группа);
 *  - это email-тред (link или type='email');
 *  - личный канал: Telegram Business / Wazzup (WhatsApp) / Telegram MTProto.
 *
 * Сигналы передаются явно — часть из них асинхронная (participant-клиент,
 * TG-link, mtproto), поэтому вычисляется вызывающим и прокидывается сюда.
 */
export type ClientFacingSignals = {
  /** В проекте есть участник-«Клиент» с доступом к треду (useThreadHasClient). */
  hasClientParticipant?: boolean
  /** Подключён групповой Telegram-бот (state.isLinked). */
  isTgGroupLinked?: boolean
  /** Email-тред (state.isEmailChat: link ИЛИ type='email'). */
  isEmailChat?: boolean
  /** Личный Telegram Business. */
  isBusiness?: boolean
  /** Личный Wazzup (WhatsApp/Instagram). */
  isWazzup?: boolean
  /** Личный Telegram MTProto. */
  isMtproto?: boolean
}

export function isClientFacingThread(s: ClientFacingSignals): boolean {
  return !!(
    s.hasClientParticipant ||
    s.isTgGroupLinked ||
    s.isEmailChat ||
    s.isBusiness ||
    s.isWazzup ||
    s.isMtproto
  )
}

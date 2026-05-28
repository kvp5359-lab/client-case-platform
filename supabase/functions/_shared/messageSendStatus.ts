/**
 * Унифицированный апдейт статуса отправки для всех каналов.
 *
 * Зачем: ровно в момент апдейта `send_status` мы пишем «сообщение доставлено»
 * либо «не доставлено». Это **единственный** источник правды для UI и для
 * глобального тоста. Любая ошибка апдейта здесь — фатальна, поэтому везде
 * используется `.throwOnError()` и нет молчаливого глотания ошибок.
 *
 * До этого хелпера каждый канал обновлял свой набор полей вручную
 * (telegram_message_id, wazzup_status, email_delivery_status, …), без
 * проверки `error` от supabase-js. Это привело к багу 22 мая: UPDATE
 * для telegram_message_id молча упал, status остался `pending`, cron-retry
 * подхватил и отправил дубль.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { logServerSendFailure } from "./sendFailureLog.ts";

export interface MarkSentOptions {
  /** Дополнительные поля канала: telegram_message_id, wazzup_message_id, etc. */
  channelFields?: Record<string, unknown>;
}

/**
 * Помечает сообщение как успешно доставленное во внешний канал. Бросает
 * исключение, если апдейт не прошёл — вызывающая функция должна **не**
 * глотать его, чтобы триггерный путь увидел не-2xx и отметил в `message_send_dispatch`.
 */
export async function markMessageSent(
  service: SupabaseClient,
  messageId: string,
  options: MarkSentOptions = {},
): Promise<void> {
  const payload: Record<string, unknown> = {
    send_status: "sent",
    send_failed_reason: null,
    ...(options.channelFields ?? {}),
  };

  // .select('id') возвращает массив affected rows. Без него supabase-js
  // возвращает success даже при UPDATE 0 строк (id не найден / RLS) — это
  // приводило к тихому bypass'у: send_status оставался 'pending', сообщение
  // реально отправлено, UI 60 сек крутил «отправляется» → «Повторить».
  // Случай docs/bugs/open/2026-05-28-telegram-send-stuck-pending.md.
  const { data, error } = await service
    .from("project_messages")
    .update(payload)
    .eq("id", messageId)
    .select("id");

  if (error) {
    throw new Error(
      `markMessageSent failed for ${messageId}: ${error.message} (${error.code})`,
    );
  }
  if (!data || data.length === 0) {
    // Жирный exception → попадёт в catch вызывающей функции → outer catch →
    // 500 → watchdog переведёт pending в failed с reason в БД, юзер видит
    // понятную ошибку, а в telegram_error_detail остаётся диагностика.
    throw new Error(
      `markMessageSent affected 0 rows for id=${messageId} — message not found or RLS denied UPDATE`,
    );
  }
}

export interface MarkFailedOptions {
  /** Дополнительные поля канала (например, error_detail). */
  channelFields?: Record<string, unknown>;
  /** Источник для записи в message_send_failures. Если null — failure не пишется. */
  failureSource?: string | null;
  /** Код ошибки для message_send_failures. */
  failureCode?: string | null;
  /** Доп. metadata в message_send_failures. */
  failureMetadata?: Record<string, unknown>;
  /** Integration id (если был выявлен). */
  integrationId?: string | null;
}

/**
 * Помечает сообщение как не доставленное. Параллельно пишет запись в
 * message_send_failures (если передан `failureSource`) — это даёт глобальный
 * тост на фронте даже у юзера, который ушёл из треда.
 *
 * Бросает исключение если основной UPDATE не прошёл. Запись в failures —
 * best-effort, её ошибка не фатальна.
 */
export async function markMessageFailed(
  service: SupabaseClient,
  messageId: string,
  reason: string,
  options: MarkFailedOptions = {},
): Promise<void> {
  const trimmedReason = reason.slice(0, 500);
  const payload: Record<string, unknown> = {
    send_status: "failed",
    send_failed_reason: trimmedReason,
    ...(options.channelFields ?? {}),
  };

  const { data, error } = await service
    .from("project_messages")
    .update(payload)
    .eq("id", messageId)
    .select("id");

  if (error) {
    throw new Error(
      `markMessageFailed failed for ${messageId}: ${error.message} (${error.code})`,
    );
  }
  // Симметрично markMessageSent: 0 строк = тихий bypass, превращаем в exception.
  if (!data || data.length === 0) {
    throw new Error(
      `markMessageFailed affected 0 rows for id=${messageId} — message not found or RLS denied UPDATE`,
    );
  }

  if (options.failureSource) {
    await logServerSendFailure(service, {
      message_id: messageId,
      error_text: trimmedReason,
      error_code: options.failureCode ?? null,
      source: options.failureSource,
      integration_id: options.integrationId ?? null,
      metadata: options.failureMetadata ?? {},
    });
  }
}

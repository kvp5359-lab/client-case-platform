/**
 * Клиентское ли сообщение по видимости — определяет, уходит ли внешняя доставка
 * ВЛОЖЕНИЙ (их шлёт фронт-invoke мимо триггера БД). Внутренние (team/self/
 * «Заметка») наружу НЕ уходят: текст блокирует триггер dispatch_message_to_channels,
 * а вложения — этот гейт. Без него внутреннее сообщение с файлом утекало клиенту
 * в канал (баг 2026-07-08). Зеркало (обратное) edge-предиката isInternalVisibility
 * из supabase/functions/_shared/outgoing.ts — держать согласованными.
 */
export function isClientVisibleForDelivery(
  visibility: string | null | undefined,
): boolean {
  return (visibility ?? 'client') === 'client'
}

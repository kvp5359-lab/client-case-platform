/**
 * Имя отправителя для префикса в мессенджерах: `messenger_name ?? имя + фамилия`.
 * Единый источник для telegram-send-message / wazzup-send / waha-send (настройка
 * «показывать имя отправителя»). Чистая функция над строкой participant — запрос
 * делает вызывающий (у каждого канала свой набор полей/скоуп).
 */
export function resolveSenderName(
  p: { name?: string | null; last_name?: string | null; messenger_name?: string | null } | null,
): string | null {
  if (!p) return null;
  return (
    p.messenger_name?.trim() ||
    [p.name, p.last_name].filter(Boolean).join(" ").trim() ||
    null
  );
}

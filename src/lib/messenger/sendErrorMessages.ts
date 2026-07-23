/**
 * Перевод «сырых» ошибок отправки (ответ Telegram/Wazzup/канала, как есть в
 * `project_messages.telegram_error_detail` / `message_send_failures.error_text`)
 * в понятный пользователю текст с подсказкой, что делать.
 *
 * Возвращает null, если ошибка неизвестна — тогда UI показывает дефолт
 * («Не удалось отправить сообщение» + превью).
 *
 * Чистый модуль (без зависимостей) — зовётся из тоста и из бабла.
 */

export function humanizeSendError(
  errorText: string | null | undefined,
): string | null {
  if (!errorText) return null
  const e = errorText.toLowerCase()

  // Telegram Business: окно 24 часа. Бот может писать от имени сотрудника только
  // в чаты, где была активность за последние 24ч (правило Telegram, не наш баг).
  if (
    e.includes('business_peer_usage_missing') ||
    e.includes('business_chat_inactive')
  ) {
    return 'Прошло больше 24 часов с последнего сообщения клиента — Telegram не разрешает боту ответить. Напишите это сообщение вручную в Telegram или дождитесь нового сообщения от клиента.'
  }

  // Business-подключение отключено/сломано.
  if (
    e.includes('business_connection_invalid') ||
    e.includes('business_connection_not_allowed')
  ) {
    return 'Подключение Telegram Business неактивно. Проверьте у сотрудника: жив ли Telegram Premium и настройки Telegram → Бизнес → Чат-боты.'
  }

  // PEER_ID_INVALID — чаще всего тот же 24ч-кейс в Business, но может быть и
  // недоступный получатель. Даём мягкую подсказку.
  if (e.includes('peer_id_invalid')) {
    return 'Telegram отклонил отправку: получатель сейчас недоступен боту (возможно, закрыто 24-часовое окно Telegram Business). Попробуйте написать вручную в Telegram или дождитесь ответа клиента.'
  }

  // Бот удалён из группы / лишён прав.
  if (
    e.includes('chat not found') ||
    e.includes('bot was kicked') ||
    e.includes('bot is not a member') ||
    e.includes('group chat was deactivated')
  ) {
    return 'Бот больше не в группе или потерял доступ к чату. Проверьте, что бот на месте и остаётся администратором.'
  }
  if (e.includes('not enough rights') || e.includes('have no rights')) {
    return 'У бота недостаточно прав в этом чате. Дайте боту право отправлять сообщения (администратора).'
  }

  // Вложение не удалось прочитать из хранилища (файл удалён / битая ссылка на
  // реестр). Письмо в таком случае НЕ уходит целиком — иначе клиент получил бы
  // его без части файлов и никто бы не заметил (инцидент 2026-07-22). Повтор
  // сам по себе не поможет — файл надо переприкрепить.
  if (e.includes('attachments_unavailable')) {
    return 'Не удалось прочитать вложение из хранилища — письмо не отправлено целиком. Удалите проблемный файл из сообщения и прикрепите заново.'
  }

  // Подпись к файлам длиннее лимита Telegram (1024 символа; у текста — 4096).
  if (e.includes('caption is too long') || e.includes('message_caption_too_long')) {
    return 'Подпись к файлам в Telegram ограничена 1024 символами — сократите текст или отправьте его отдельным сообщением.'
  }

  // Слишком большой файл.
  if (e.includes('too big') || e.includes('file is too big')) {
    return 'Файл слишком большой для Telegram (максимум 20 МБ). Уменьшите размер или отправьте ссылкой.'
  }

  // Rate limit / flood.
  if (e.includes('too many requests') || e.includes('flood')) {
    return 'Слишком много сообщений подряд — Telegram просит подождать. Повторите отправку через минуту.'
  }

  return null
}

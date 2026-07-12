/**
 * Сентинел «сообщение только с вложениями, без подписи».
 *
 * БД не принимает пустой content (CHECK), поэтому исходящее с одними файлами
 * (или split-запись «текст отдельно + файлы отдельно») пишет content = этот
 * плейсхолдер. Фронт и рендер трактуют его как пустую подпись.
 *
 * ⚠️ Значение должно СОВПАДАТЬ с серверными копиями сентинела:
 *   - mtproto: mtproto-service/src/routes/commandHelpers.ts ATTACHMENTS_ONLY_PLACEHOLDER
 *   - edge telegram-send: тот же символ 📎
 * При смене символа править все три рантайма согласованно.
 */
export const ATTACHMENT_PLACEHOLDER = '\u{1F4CE}' // 📎

/** true, если content — сентинел «только вложения» (без реальной подписи). */
export function isAttachmentPlaceholder(content: string | null | undefined): boolean {
  return content === ATTACHMENT_PLACEHOLDER
}

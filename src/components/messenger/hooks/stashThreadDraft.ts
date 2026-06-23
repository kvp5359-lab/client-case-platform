/**
 * Кладёт первое сообщение нового треда в его ЧЕРНОВИК (а не отправляет).
 * Используется кнопкой «Сохранить черновик» при создании email.
 *
 * Пишем в те же хранилища, что читает композер при открытии треда:
 *  - текст → localStorage `msg_draft:{threadId}` (useDraftMessage)
 *  - файлы → IndexedDB по тому же ключу (useDraftFiles / useMessageFiles)
 *
 * Запись ДО открытия треда и через те же хранилища = нет гонки с restore
 * и черновик переживает перезагрузку страницы.
 */

import { saveDraftFiles } from './useDraftFiles'

function htmlHasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
}

export async function stashThreadDraft(
  threadId: string,
  html: string,
  files: File[],
): Promise<void> {
  const draftKey = `msg_draft:${threadId}`
  try {
    if (html && htmlHasText(html)) {
      localStorage.setItem(draftKey, html)
    }
  } catch {
    /* quota / SSR */
  }
  if (files.length > 0) {
    await saveDraftFiles(draftKey, files)
  }
}

import { useCallback, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { getThreadDraft, saveThreadDraft, deleteThreadDraftText } from '@/services/api/messenger/threadDraftService'
import { notifyDraftChanged } from './draftChangeBus'
import { logger } from '@/utils/logger'

/** Время последней локальной правки черновика — для сверки с серверной версией. */
const tsKeyOf = (draftKey: string) => draftKey.replace(/^msg_draft:/, 'msg_draft_ts:')

/**
 * Черновик поля ввода.
 *
 * Local-first: localStorage пишется сразу (мгновенно, работает офлайн), сервер —
 * слой синхронизации между устройствами с более длинным debounce. Если писать
 * только на сервер, при плохой связи теряются последние набранные слова, а ввод
 * подтормаживает.
 *
 * Конфликт «печатал на двух устройствах» решается по времени правки: побеждает
 * более свежая версия (для черновика это приемлемо и предсказуемо).
 *
 * Серверная синхронизация включается только когда известны threadId и userId.
 * Черновик до создания треда (новое письмо) остаётся чисто локальным.
 */
export function useDraftMessage(
  draftKey: string,
  editorRef: React.MutableRefObject<Editor | null>,
  editorReady: boolean,
  editingMessage: unknown | null,
  setHasText: (v: boolean) => void,
  threadId?: string | null,
  userId?: string | null,
) {
  const syncEnabled = !!threadId && !!userId
  const remoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipDraftRestoreRef = useRef(false)
  // Keep latest editor content in refs so we can flush on unmount
  // (editor instance may already be destroyed by the time cleanup runs)
  const lastHtmlRef = useRef('')
  const lastTextRef = useRef('')

  const saveDraft = useCallback(
    (html: string, text: string) => {
      lastHtmlRef.current = html
      lastTextRef.current = text
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
      draftTimerRef.current = setTimeout(() => {
        if (text.trim()) {
          try {
            localStorage.setItem(draftKey, html)
            localStorage.setItem(tsKeyOf(draftKey), new Date().toISOString())
          } catch {
            /* quota */
          }
        } else {
          localStorage.removeItem(draftKey)
          localStorage.removeItem(tsKeyOf(draftKey))
        }
      }, 500)

      // Сервер — реже, чем localStorage: печать не должна порождать запрос на
      // каждую паузу в полсекунды.
      if (!syncEnabled) return
      if (remoteTimerRef.current) clearTimeout(remoteTimerRef.current)
      remoteTimerRef.current = setTimeout(() => {
        saveThreadDraft(threadId!, userId!, text.trim() ? html : '')
          .then(() => notifyDraftChanged(threadId!))
          .catch((e) => logger.error('Не удалось сохранить черновик на сервере:', e))
      }, 2000)
    },
    [draftKey, syncEnabled, threadId, userId],
  )

  const clearDraft = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    lastHtmlRef.current = ''
    lastTextRef.current = ''
    localStorage.removeItem(draftKey)
    localStorage.removeItem(tsKeyOf(draftKey))
    if (remoteTimerRef.current) clearTimeout(remoteTimerRef.current)
    if (syncEnabled) {
      deleteThreadDraftText(threadId!, userId!)
        .then(() => notifyDraftChanged(threadId!))
        .catch((e) => logger.error('Не удалось очистить черновик на сервере:', e))
    }
  }, [draftKey, syncEnabled, threadId, userId])

  // Flush pending draft on key change or unmount using cached refs
  useEffect(() => {
    const key = draftKey
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current)
        draftTimerRef.current = null
      }
      if (lastTextRef.current.trim()) {
        try {
          localStorage.setItem(key, lastHtmlRef.current)
        } catch {
          /* quota */
        }
      }
    }
  }, [draftKey])

  // Restore draft on project switch / mount / editor ready
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !editorReady || editingMessage) return
    if (skipDraftRestoreRef.current) {
      skipDraftRestoreRef.current = false
      return
    }
    // Если есть осиротевший outbox (отправка не завершилась — закрыли браузер
    // или пропал интернет насовсем) — поднимаем его как черновик.
    const outboxKey = draftKey.replace(/^msg_draft:/, 'msg_outbox:')
    if (outboxKey !== draftKey) {
      const orphaned = localStorage.getItem(outboxKey)
      if (orphaned) {
        localStorage.setItem(draftKey, orphaned)
        localStorage.removeItem(outboxKey)
      }
    }
    const saved = localStorage.getItem(draftKey)
    if (saved) {
      editor.commands.setContent(saved)
      queueMicrotask(() => setHasText(!!editor.getText().trim()))
    } else {
      editor.commands.clearContent()
      queueMicrotask(() => setHasText(false))
    }
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
    // Снимок того, что мы сами положили в редактор. Если к моменту ответа сервера
    // содержимое другое — пользователь успел начать печатать, и подставлять
    // серверную версию нельзя (затрём набранное).
    const restoredHtml = editor.getHTML()

    // Догоняем серверную версию: если на другом устройстве печатали позже —
    // подставляем её. Локальную версию показали выше сразу (без ожидания сети).
    if (!syncEnabled) return
    let cancelled = false
    const localTs = localStorage.getItem(tsKeyOf(draftKey))
    getThreadDraft(threadId!, userId!)
      .then((remote) => {
        if (cancelled || !remote) return
        // Сравниваем со временем локальной правки: пустая метка = локального
        // черновика нет, значит серверный точно свежее.
        const remoteWins = !localTs || new Date(remote.updatedAt) > new Date(localTs)
        if (!remoteWins || remote.content === (saved ?? '')) return
        const ed = editorRef.current
        if (!ed) return
        // Пользователь уже что-то набрал, пока шёл запрос — его текст важнее.
        if (ed.getHTML() !== restoredHtml) return
        ed.commands.setContent(remote.content)
        localStorage.setItem(draftKey, remote.content)
        localStorage.setItem(tsKeyOf(draftKey), remote.updatedAt)
        setHasText(!!ed.getText().trim())
      })
      .catch((e) => logger.error('Не удалось получить черновик с сервера:', e))
    return () => {
      cancelled = true
    }
  }, [draftKey, editorReady, editingMessage, editorRef, setHasText, syncEnabled, threadId, userId])

  return { saveDraft, clearDraft, skipDraftRestoreRef }
}

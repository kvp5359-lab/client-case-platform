import { useCallback, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'

export function useDraftMessage(
  draftKey: string,
  editorRef: React.MutableRefObject<Editor | null>,
  editorReady: boolean,
  editingMessage: unknown | null,
  setHasText: (v: boolean) => void,
) {
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
          } catch {
            /* quota */
          }
        } else {
          localStorage.removeItem(draftKey)
        }
      }, 500)
    },
    [draftKey],
  )

  const clearDraft = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    lastHtmlRef.current = ''
    lastTextRef.current = ''
    localStorage.removeItem(draftKey)
  }, [draftKey])

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
  }, [draftKey, editorReady, editingMessage, editorRef, setHasText])

  return { saveDraft, clearDraft, skipDraftRestoreRef }
}

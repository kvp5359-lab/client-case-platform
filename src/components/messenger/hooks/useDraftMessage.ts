import { useCallback, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'

const DRAFT_PREFIX = 'msg_draft:'

export function useDraftMessage(
  projectId: string,
  channel: string,
  editorRef: React.MutableRefObject<Editor | null>,
  editingMessage: unknown | null,
  setHasText: (v: boolean) => void,
) {
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipDraftRestoreRef = useRef(false)
  const draftKey = `${DRAFT_PREFIX}${projectId}:${channel}`

  const saveDraft = useCallback(
    (html: string, text: string) => {
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
    localStorage.removeItem(draftKey)
  }, [draftKey])

  // Restore draft on project switch / mount
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || editingMessage) return
    if (skipDraftRestoreRef.current) {
      skipDraftRestoreRef.current = false
      return
    }
    const currentDraftKey = draftKey
    const saved = localStorage.getItem(currentDraftKey)
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
  }, [draftKey, editingMessage])

  // Cleanup timer on unmount
  useEffect(
    () => () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    },
    [],
  )

  return { saveDraft, clearDraft, skipDraftRestoreRef }
}

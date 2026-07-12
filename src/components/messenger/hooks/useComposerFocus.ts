import { useEffect, useRef, type Dispatch, type SetStateAction, type MutableRefObject } from 'react'
import type { Editor } from '@tiptap/react'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { isMobileViewport } from '@/lib/isMobile'

/**
 * Вся фокус-логика композера: автофокус при смене треда, возврат фокуса после
 * отправки/ответа, восстановление текста по событию сетевой ошибки, трекинг
 * «был ли редактор сфокусирован в этом треде» (для useQuoteInsertion —
 * вставка в позицию курсора vs в конец).
 *
 * Вынесено из MessageInput.tsx (аудит 2026-07-13) — логика и тайминги
 * (setTimeout 50/150) не менялись, только собраны в один хук.
 *
 * Возвращает `hasBeenFocusedRef` — читается в useQuoteInsertion и при вставке
 * из буфера пересылки.
 */
export function useComposerFocus(args: {
  editor: Editor | null
  editorRef: MutableRefObject<Editor | null>
  threadId?: string
  isPending: boolean
  replyTo: ProjectMessage | null
  setHasText: Dispatch<SetStateAction<boolean>>
}): { hasBeenFocusedRef: MutableRefObject<boolean> } {
  const { editor, editorRef, threadId, isPending, replyTo, setHasText } = args

  // Отмечает, был ли редактор сфокусирован хотя бы раз в текущем треде.
  const hasBeenFocusedRef = useRef(false)

  // Auto-focus editor when thread changes or component mounts (задержка — анимация панели).
  // На мобиле НЕ фокусируем при открытии треда — иначе сразу всплывает экранная
  // клавиатура и перекрывает ленту. Фокус по реальному действию (тап в поле,
  // «Ответить», «Цитировать») работает как раньше.
  useEffect(() => {
    if (isMobileViewport()) return
    if (editorRef.current) {
      const timer = setTimeout(() => editorRef.current?.commands.focus('end'), 150)
      return () => clearTimeout(timer)
    }
  }, [threadId, editor, editorRef])

  // Возвращаем фокус в поле после завершения отправки (на время isPending редактор disabled → фокус слетает).
  const wasPendingRef = useRef(false)
  useEffect(() => {
    if (wasPendingRef.current && !isPending) {
      editorRef.current?.commands.focus('end')
    }
    wasPendingRef.current = isPending
  }, [isPending, editorRef])

  // Восстанавливаем неотправленный текст в редактор после сетевой ошибки.
  useEffect(() => {
    if (!threadId) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ threadId: string; content: string }>).detail
      if (!detail || detail.threadId !== threadId) return
      const ed = editorRef.current
      if (!ed) return
      ed.commands.setContent(detail.content)
      setHasText(!!ed.getText().trim())
      ed.commands.focus('end')
    }
    window.addEventListener('messenger:restore-draft', handler)
    return () => window.removeEventListener('messenger:restore-draft', handler)
  }, [threadId, editorRef, setHasText])

  // Focus editor on reply.
  // setTimeout(50) — клик по «Ответить» в Radix меню запускает возврат фокуса
  // на trigger через свой setTimeout(0). RAF (16мс) на практике иногда
  // проигрывает Radix-у. setTimeout(50) гарантирует, что наш focus идёт
  // последним. editor в deps — на случай, когда replyTo выставился раньше,
  // чем смонтировался редактор; эффект повторно сработает при появлении editor.
  useEffect(() => {
    if (!replyTo || !editor) return
    const timer = setTimeout(() => editor.commands.focus('end'), 50)
    return () => clearTimeout(timer)
  }, [replyTo, editor])

  // Отслеживаем onFocus редактора. Используется в useQuoteInsertion.
  useEffect(() => {
    if (!editor) return
    const handler = () => {
      hasBeenFocusedRef.current = true
    }
    editor.on('focus', handler)
    return () => {
      editor.off('focus', handler)
    }
  }, [editor])

  // Смена треда — сбрасываем флаг: в новом треде юзер ещё не работал.
  useEffect(() => {
    hasBeenFocusedRef.current = false
  }, [threadId])

  return { hasBeenFocusedRef }
}

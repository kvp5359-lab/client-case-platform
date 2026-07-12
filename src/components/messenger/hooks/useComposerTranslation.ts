import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { Editor } from '@tiptap/react'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'

/** Состояние перевода исходящего сообщения. В редакторе лежит перевод, оригинал
 *  хранится тут и уйдёт в БД как `original_content` при отправке. */
export type ComposerTranslation = {
  originalContent: string
  translatedHtml: string
  targetLanguage: string
  sourceLanguage: string | null
}

/**
 * Логика плашки «Переведено» в композере: состояние перевода, его persistence в
 * localStorage (переживает перезагрузку), восстановление после reload и
 * применение/откат перевода. Вынесено из MessageInput как связная забота.
 */
export function useComposerTranslation(params: {
  editorRef: RefObject<Editor | null>
  editor: Editor | null
  translationKey: string
  editingMessage: ProjectMessage | null
  setHasText: (v: boolean) => void
}) {
  const { editorRef, editor, translationKey, editingMessage, setHasText } = params

  const [translation, setTranslation] = useState<ComposerTranslation | null>(null)

  // localStorage helpers для persistence плашки «Переведено».
  const persistTranslation = useCallback(
    (t: ComposerTranslation) => {
      try {
        localStorage.setItem(translationKey, JSON.stringify(t))
      } catch {
        /* quota / SSR */
      }
    },
    [translationKey],
  )
  const clearPersistedTranslation = useCallback(() => {
    try {
      localStorage.removeItem(translationKey)
    } catch {
      /* SSR */
    }
  }, [translationKey])

  // Восстановление плашки «Переведено» после перезагрузки страницы.
  // useDraftMessage уже вставил html в редактор; здесь проверяем — если он
  // совпадает с translatedHtml, значит черновик и есть перевод → показываем
  // банер. Если юзер успел поправить — translation в localStorage устарел,
  // удаляем. Зависимости совпадают с useDraftMessage, чтобы эффект прошёл
  // после его восстановления.
  useEffect(() => {
    if (!editor || editingMessage) return
    let saved: string | null
    try {
      saved = localStorage.getItem(translationKey)
    } catch {
      saved = null
    }
    if (!saved) return
    let parsed: ComposerTranslation | null = null
    try {
      parsed = JSON.parse(saved)
    } catch {
      /* corrupted */
    }
    if (!parsed) {
      try {
        localStorage.removeItem(translationKey)
      } catch {
        /* SSR */
      }
      return
    }
    // useDraftMessage гидратирует html синхронно в своём useEffect; к моменту
    // нашего useEffect editor.getHTML() уже актуальный. Синхронизация state
    // из localStorage на mount — нормальный паттерн, lazy useState тут не
    // подходит: editor.getHTML() недоступен до коммита эффектов.
    if (editor.getHTML() === parsed.translatedHtml) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTranslation(parsed)
    } else {
      try {
        localStorage.removeItem(translationKey)
      } catch {
        /* SSR */
      }
    }
  }, [translationKey, editor, editingMessage])

  const handleTranslated = useCallback(
    (input: {
      originalContent: string
      translatedContent: string
      targetLanguage: string
      sourceLanguage: string | null
    }) => {
      const editor = editorRef.current
      if (!editor) return
      editor.commands.setContent(input.translatedContent)
      setHasText(!!editor.getText().trim())
      // translatedHtml — то, что РЕАЛЬНО лежит в редакторе после setContent
      // (tiptap может слегка нормализовать html). По этому полю на маунте
      // мы будем понимать, что текст в редакторе всё ещё перевод, а не правки.
      const translatedHtml = editor.getHTML()
      const next = {
        originalContent: input.originalContent,
        translatedHtml,
        targetLanguage: input.targetLanguage,
        sourceLanguage: input.sourceLanguage,
      }
      setTranslation(next)
      persistTranslation(next)
    },
    [editorRef, setHasText, persistTranslation],
  )

  const handleRevertTranslation = useCallback(() => {
    const editor = editorRef.current
    if (!editor || !translation) return
    editor.commands.setContent(translation.originalContent)
    setHasText(!!editor.getText().trim())
    setTranslation(null)
    clearPersistedTranslation()
  }, [editorRef, translation, setHasText, clearPersistedTranslation])

  return {
    translation,
    setTranslation,
    clearPersistedTranslation,
    handleTranslated,
    handleRevertTranslation,
  }
}

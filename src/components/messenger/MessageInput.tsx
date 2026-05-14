import { useState, useRef, useCallback, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { MessengerAccent } from './MessageBubble'
import { MinimalTiptapEditor } from './MinimalTiptapEditor'
import { EditingBanner, ReplyBanner, TranslationBanner } from './MessageInputBanners'
import { MessageAttachmentsRow } from './MessageAttachmentsRow'
import { MessageInputToolbar } from './MessageInputToolbar'
import type { ForwardedAttachment } from '@/services/api/messenger/messengerService'
import { isHtmlContent, plainTextToHtml } from '@/utils/format/messengerHtml'
import { useDraftMessage } from './hooks/useDraftMessage'
import { useMessageFiles } from './hooks/useMessageFiles'
import { useEditorResizer } from './hooks/useEditorResizer'
import { useTaskStatusPending } from './hooks/useTaskStatusPending'
import { useQuoteInsertion } from './hooks/useQuoteInsertion'

interface MessageInputProps {
  projectId: string
  channel: string
  workspaceId: string
  threadId?: string
  replyTo: ProjectMessage | null
  onClearReply: () => void
  onSend: (
    content: string,
    replyToId?: string | null,
    files?: File[],
    options?: { originalContent?: string | null; originalLanguage?: string | null },
  ) => void
  isPending: boolean
  onTyping?: () => void
  accent?: MessengerAccent
  editingMessage: ProjectMessage | null
  onClearEdit: () => void
  onEdit: (
    messageId: string,
    content: string,
    draftFiles?: { keepAttachmentIds: string[]; newFiles: File[]; publish?: boolean },
  ) => void
  quoteText?: string | null
  onClearQuote?: () => void
  onOpenDocPicker?: () => void
  projectDocumentsCount?: number
  addFilesRef?: React.MutableRefObject<((files: File[]) => void) | null>
  onDocumentDrop?: (documentId: string) => void
  forwardedAttachments?: ForwardedAttachment[]
  onRemoveForwardedAttachment?: (index: number) => void
  onSaveDraft?: (content: string, files?: File[]) => void
  isSavingDraft?: boolean
  /** Тип треда. Если 'task' — показываем переключатель статуса. */
  threadType?: 'chat' | 'task'
  /** Текущий статус задачи (nullable). */
  threadStatusId?: string | null
}

export function MessageInput({
  projectId,
  channel,
  workspaceId,
  threadId,
  replyTo,
  onClearReply,
  onSend,
  isPending,
  onTyping,
  accent = 'blue',
  editingMessage,
  onClearEdit,
  onEdit,
  quoteText,
  onClearQuote,
  onOpenDocPicker,
  projectDocumentsCount = 0,
  addFilesRef,
  onDocumentDrop,
  forwardedAttachments = [],
  onRemoveForwardedAttachment,
  onSaveDraft,
  isSavingDraft,
  threadType,
  threadStatusId,
}: MessageInputProps) {
  const [hasText, setHasText] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [openQuickReplyPicker, setOpenQuickReplyPicker] = useState(false)
  // Состояние перевода исходящего: если задано — пользователь нажал «Перевести»,
  // в редакторе сейчас лежит перевод, оригинал хранится тут и уйдёт в БД
  // как `original_content` при отправке.
  //
  // translatedHtml — html в редакторе сразу после установки перевода (для
  // сравнения: если юзер начал править — translation сбрасывается). Также
  // используется при восстановлении состояния после перезагрузки страницы.
  const [translation, setTranslation] = useState<{
    originalContent: string
    translatedHtml: string
    targetLanguage: string
    sourceLanguage: string | null
  } | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { editorMaxHeight, handleResizerMouseDown } = useEditorResizer()

  const draftKey = threadId ? `msg_draft:${threadId}` : `msg_draft:${projectId}:${channel}`
  const translationKey = threadId
    ? `msg_translation:${threadId}`
    : `msg_translation:${projectId}:${channel}`

  // localStorage helpers для persistence плашки «Переведено».
  const persistTranslation = useCallback(
    (t: NonNullable<typeof translation>) => {
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

  const {
    isTaskThread,
    taskStatuses,
    effectivePendingStatusId,
    handlePickStatus,
    updateStatusMutation,
    clearPending,
  } = useTaskStatusPending({ threadId, projectId, workspaceId, threadType, threadStatusId })

  const {
    files,
    existingAttachments,
    isDragging,
    addFiles,
    removeFile,
    removeExistingAttachment,
    loadExistingAttachments,
    clearFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useMessageFiles(draftKey, addFilesRef, onDocumentDrop)

  const { saveDraft, clearDraft, skipDraftRestoreRef } = useDraftMessage(
    draftKey,
    editorRef,
    !!editor,
    editingMessage,
    setHasText,
  )

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
    let parsed: {
      originalContent: string
      translatedHtml: string
      targetLanguage: string
      sourceLanguage: string | null
    } | null = null
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

  // Auto-focus editor when thread changes or component mounts (задержка — анимация панели)
  useEffect(() => {
    if (editorRef.current) {
      const timer = setTimeout(() => editorRef.current?.commands.focus('end'), 150)
      return () => clearTimeout(timer)
    }
  }, [threadId, editor])

  // Возвращаем фокус в поле после завершения отправки (на время isPending редактор disabled → фокус слетает).
  const wasPendingRef = useRef(false)
  useEffect(() => {
    if (wasPendingRef.current && !isPending) {
      editorRef.current?.commands.focus('end')
    }
    wasPendingRef.current = isPending
  }, [isPending])

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
  }, [threadId])

  // Focus editor on reply.
  // requestAnimationFrame — клик по «Ответить» в контекстном меню (Radix)
  // закрывает меню и возвращает фокус на trigger (баббл) ПОСЛЕ нашего эффекта;
  // без отложенного вызова возврат фокуса перебивает focus('end'), и курсор
  // в поле ввода не появляется. RAF гарантирует, что мы фокусируем после
  // того, как Radix отработал.
  useEffect(() => {
    if (replyTo && editorRef.current) {
      const id = requestAnimationFrame(() => {
        editorRef.current?.commands.focus('end')
      })
      return () => cancelAnimationFrame(id)
    }
  }, [replyTo])

  useQuoteInsertion(editor, quoteText, onClearQuote)

  // Load content for editing
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !editingMessage) return
    const content = isHtmlContent(editingMessage.content)
      ? editingMessage.content
      : plainTextToHtml(editingMessage.content)
    editor.commands.setContent(content)
    editor.commands.focus('end')
    queueMicrotask(() => setHasText(!!editor.getText().trim()))
    if (editingMessage.is_draft && editingMessage.attachments?.length) {
      loadExistingAttachments(editingMessage.attachments)
    }
  }, [editingMessage, loadExistingAttachments])

  const handleSend = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const textContent = editor.getText().trim()
    const htmlContent = editor.getHTML()

    if (editingMessage) {
      if (!textContent || isPending) return
      onEdit(
        editingMessage.id,
        htmlContent,
        editingMessage.is_draft
          ? {
              keepAttachmentIds: existingAttachments.map((a) => a.id),
              newFiles: files,
              publish: true,
            }
          : undefined,
      )
      editor.commands.clearContent()
      setHasText(false)
      clearFiles()
      skipDraftRestoreRef.current = true
      onClearEdit()
      return
    }

    if (isPending) return

    const hasMessageContent = !!textContent || files.length > 0
    const hasPendingStatus = !!(isTaskThread && threadId && effectivePendingStatusId)
    if (!hasMessageContent && !hasPendingStatus) return

    const sendMessage = () => {
      // Перекладываем текст из draft в outbox: если отправка зависнет / упадёт /
      // браузер закроется — текст не потеряется. useSendMessage очистит outbox
      // при успехе или вернёт обратно в draft при ошибке.
      if (textContent && threadId) {
        try {
          localStorage.setItem(`msg_outbox:${threadId}`, htmlContent)
        } catch {
          /* quota */
        }
      }
      const options = translation
        ? {
            originalContent: translation.originalContent,
            originalLanguage: translation.sourceLanguage,
          }
        : undefined
      onSend(
        textContent ? htmlContent : '📎',
        replyTo?.id,
        files.length > 0 ? files : undefined,
        options,
      )
      editor.commands.clearContent()
      setHasText(false)
      clearFiles()
      clearDraft()
      onClearReply()
      setTranslation(null)
      clearPersistedTranslation()
    }

    // Если в пикере выбран новый статус — сначала меняем его, потом (только если
    // есть текст/файлы) отправляем сообщение. При пустом поле просто смена статуса.
    if (hasPendingStatus) {
      updateStatusMutation.mutate(
        { threadId: threadId!, statusId: effectivePendingStatusId! },
        {
          onSuccess: () => {
            clearPending()
            if (hasMessageContent) sendMessage()
          },
        },
      )
      return
    }

    sendMessage()
  }, [
    files,
    existingAttachments,
    isPending,
    onSend,
    replyTo,
    onClearReply,
    editingMessage,
    onEdit,
    onClearEdit,
    clearDraft,
    clearFiles,
    skipDraftRestoreRef,
    isTaskThread,
    threadId,
    effectivePendingStatusId,
    updateStatusMutation,
    clearPending,
    translation,
    clearPersistedTranslation,
  ])

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
    [persistTranslation],
  )

  const handleRevertTranslation = useCallback(() => {
    const editor = editorRef.current
    if (!editor || !translation) return
    editor.commands.setContent(translation.originalContent)
    setHasText(!!editor.getText().trim())
    setTranslation(null)
    clearPersistedTranslation()
  }, [translation, clearPersistedTranslation])

  const handleSaveDraft = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const textContent = editor.getText().trim()
    const htmlContent = editor.getHTML()

    if (!textContent && files.length === 0) return

    if (editingMessage?.is_draft) {
      onEdit(editingMessage.id, htmlContent, {
        keepAttachmentIds: existingAttachments.map((a) => a.id),
        newFiles: files,
      })
    } else if (onSaveDraft) {
      onSaveDraft(textContent ? htmlContent : '', files.length > 0 ? files : undefined)
    } else {
      return
    }

    editor.commands.clearContent()
    setHasText(false)
    clearFiles()
    clearDraft()
    if (editingMessage) {
      skipDraftRestoreRef.current = true
      onClearEdit()
    }
  }, [
    files,
    existingAttachments,
    onSaveDraft,
    clearDraft,
    clearFiles,
    editingMessage,
    onEdit,
    onClearEdit,
    skipDraftRestoreRef,
  ])

  const totalFiles = files.length + existingAttachments.length + forwardedAttachments.length
  const hasAnyFiles = totalFiles > 0
  // В задачах кнопка отправки активна даже без текста/файлов, если в пикере
  // статуса выбран новый статус — тогда отправка просто применит его.
  const hasPendingStatus = !!(isTaskThread && effectivePendingStatusId)
  const hasContent = hasText || hasAnyFiles || hasPendingStatus

  return (
    <div
      ref={containerRef}
      className="border-t relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-20 flex items-center justify-center group"
        onMouseDown={handleResizerMouseDown}
      >
        <div className="w-8 h-1 rounded-full bg-border group-hover:bg-muted-foreground/40 transition-colors" />
      </div>

      {isDragging && (
        <div className="absolute inset-0 bg-blue-50/80 border-2 border-dashed border-blue-300 rounded-lg z-10 flex items-center justify-center">
          <p className="text-sm text-blue-600 font-medium">Перетащите файлы сюда</p>
        </div>
      )}

      {editingMessage && (
        <EditingBanner editingMessage={editingMessage} onClearEdit={onClearEdit} />
      )}

      {replyTo && !editingMessage && <ReplyBanner replyTo={replyTo} onClearReply={onClearReply} />}

      {translation && !editingMessage && (
        <TranslationBanner
          originalContent={translation.originalContent}
          originalLanguage={translation.sourceLanguage}
          targetLanguage={translation.targetLanguage}
          onRevert={handleRevertTranslation}
        />
      )}

      <div
        className="px-4 pt-2 min-w-0"
        onKeyDown={(e) => {
          if (e.key === '/' && !hasText && editorRef.current) {
            e.preventDefault()
            setOpenQuickReplyPicker(true)
          }
        }}
      >
        <MinimalTiptapEditor
          editorRef={editorRef}
          onSend={handleSend}
          onTyping={() => {
            const text = editorRef.current?.getText() ?? ''
            const html = editorRef.current?.getHTML() ?? ''
            setHasText(!!text.trim())
            saveDraft(html, text)
            // Если плашка перевода активна и юзер начал править перевод —
            // сбрасываем её: «оригинал» больше не релевантен правленому тексту.
            if (translation && html !== translation.translatedHtml) {
              setTranslation(null)
              clearPersistedTranslation()
            }
            onTyping?.()
          }}
          onPasteFiles={addFiles}
          disabled={isPending}
          onEditorReady={setEditor}
          editorMaxHeight={editorMaxHeight}
        />
      </div>

      {hasAnyFiles && (
        <MessageAttachmentsRow
          existingAttachments={existingAttachments}
          files={files}
          forwardedAttachments={forwardedAttachments}
          onRemoveExisting={removeExistingAttachment}
          onRemoveFile={removeFile}
          onRemoveForwarded={onRemoveForwardedAttachment}
        />
      )}

      <MessageInputToolbar
        editor={editor}
        projectId={projectId}
        workspaceId={workspaceId}
        totalFiles={totalFiles}
        hasContent={hasContent}
        isPending={isPending}
        isSavingDraft={isSavingDraft}
        showSaveDraft={!!onSaveDraft}
        openQuickReplyPicker={openQuickReplyPicker}
        accent={accent}
        onFilesSelected={addFiles}
        onOpenDocPicker={onOpenDocPicker}
        projectDocumentsCount={projectDocumentsCount}
        onQuickReplyPickerHandled={() => setOpenQuickReplyPicker(false)}
        onSend={handleSend}
        onSaveDraft={handleSaveDraft}
        taskStatusPicker={
          isTaskThread
            ? {
                statuses: taskStatuses,
                currentStatusId: threadStatusId ?? null,
                pendingStatusId: effectivePendingStatusId,
                onPick: handlePickStatus,
              }
            : undefined
        }
        translate={
          editingMessage
            ? undefined
            : {
                threadId,
                getCurrentContent: () => editorRef.current?.getHTML() ?? '',
                onTranslated: handleTranslated,
              }
        }
      />
    </div>
  )
}

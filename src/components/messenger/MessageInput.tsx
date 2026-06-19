import { useState, useRef, useCallback, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { MessengerAccent } from './MessageBubble'
import { MinimalTiptapEditor } from './MinimalTiptapEditor'
import { EditingBanner, ReplyBanner, TranslationBanner } from './MessageInputBanners'
import { MessageAttachmentsRow } from './MessageAttachmentsRow'
import { MessageInputToolbar } from './MessageInputToolbar'
import { MODE_VISIBILITY, type ComposerMode } from './ComposerVisibilitySwitch'
import type { ForwardedAttachment } from '@/services/api/messenger/messengerService'
import { isHtmlContent, plainTextToHtml } from '@/utils/format/messengerHtml'
import { useDraftMessage } from './hooks/useDraftMessage'
import { useMessageFiles } from './hooks/useMessageFiles'
import { useEditorResizer } from './hooks/useEditorResizer'
import { useQuoteInsertion } from './hooks/useQuoteInsertion'

type MessageInputProps = {
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
    options?: {
      originalContent?: string | null
      originalLanguage?: string | null
      visibility?: 'client' | 'team' | 'self'
      notifySubscribers?: boolean
    },
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
  /** Счётчик, растущий на каждый setQuoteText. Передаётся в useQuoteInsertion,
   *  чтобы повторное цитирование того же текста тоже триггерило вставку. */
  quoteNonce?: number
  onClearQuote?: () => void
  onOpenDocPicker?: () => void
  projectDocumentsCount?: number
  addFilesRef?: React.MutableRefObject<((files: File[]) => void) | null>
  /** Ref для вставки готового HTML в редактор (используется буфером пересылки). */
  insertContentRef?: React.MutableRefObject<((html: string) => void) | null>
  onDocumentDrop?: (documentId: string) => void
  forwardedAttachments?: ForwardedAttachment[]
  onRemoveForwardedAttachment?: (index: number) => void
  onSaveDraft?: (content: string, files?: File[]) => void
  isSavingDraft?: boolean
  onSchedule?: (
    sendAt: Date,
    content: string,
    replyToId?: string | null,
    files?: File[],
  ) => void
  /** Режим видимости (Клиенту/Команде/Заметка/Только я) — поднят в MessengerTabContent. */
  composerMode?: ComposerMode
  /**
   * Pending-статус задачи (Planfix-style) — пикер поднят в MessengerTabContent,
   * сюда передаётся для коммита статуса при отправке. undefined — не task-тред.
   */
  statusPending?: {
    isTaskThread: boolean
    effectivePendingStatusId: string | null
    updateStatusMutation: {
      mutate: (
        vars: { threadId: string; statusId: string },
        opts?: { onSuccess?: () => void },
      ) => void
    }
    clearPending: () => void
  }
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
  quoteNonce,
  onClearQuote,
  onOpenDocPicker,
  projectDocumentsCount = 0,
  addFilesRef,
  insertContentRef,
  onDocumentDrop,
  forwardedAttachments = [],
  onRemoveForwardedAttachment,
  onSaveDraft,
  isSavingDraft,
  onSchedule,
  composerMode = 'client',
  statusPending,
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
  // Отмечает, был ли редактор сфокусирован хотя бы раз в текущем треде.
  // Нужно для useQuoteInsertion: если был — вставка в позицию курсора
  // (Tiptap хранит последнюю selection), иначе — в конец документа.
  // editor.isFocused в момент клика «Цитировать» всегда false, потому что
  // выделение текста в баббле уводит DOM Selection из редактора.
  const hasBeenFocusedRef = useRef(false)
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

  const isTaskThread = statusPending?.isTaskThread ?? false
  const effectivePendingStatusId = statusPending?.effectivePendingStatusId ?? null

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
  } = useMessageFiles(draftKey, addFilesRef, onDocumentDrop, () => {
    // Возврат фокуса в редактор после прикрепления (input/paste/drop/проектные
    // документы). setTimeout(50) надёжнее RAF — нативный <input type="file">
    // диалог и Radix DropdownMenu возвращают фокус через setTimeout, RAF
    // (16мс) может проиграть. 50мс гарантирует, что наш focus последний.
    setTimeout(() => editorRef.current?.commands.focus('end'), 50)
  })

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

  // Отслеживаем onFocus редактора. Используется в useQuoteInsertion ниже.
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

  useQuoteInsertion(editor, quoteText, quoteNonce, hasBeenFocusedRef, onClearQuote)

  // Вставка готового HTML в редактор (буфер пересылки, режим «как оригинал»/
  // «как цитата»). Позиция — как в useQuoteInsertion: в курсор, если редактор
  // уже был сфокусирован в этом треде, иначе в конец.
  useEffect(() => {
    if (!insertContentRef) return
    insertContentRef.current = (html: string) => {
      if (!editor || !html) return
      const chain = editor.chain()
      ;(hasBeenFocusedRef.current ? chain.focus() : chain.focus('end'))
        .insertContent(html)
        .run()
    }
    return () => {
      if (insertContentRef) insertContentRef.current = null
    }
  }, [editor, insertContentRef])

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
      const vis = MODE_VISIBILITY[composerMode]
      const options = {
        ...(translation
          ? {
              originalContent: translation.originalContent,
              originalLanguage: translation.sourceLanguage,
            }
          : {}),
        visibility: vis.visibility,
        notifySubscribers: vis.notifySubscribers,
      }
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
    if (hasPendingStatus && statusPending) {
      statusPending.updateStatusMutation.mutate(
        { threadId: threadId!, statusId: effectivePendingStatusId! },
        {
          onSuccess: () => {
            statusPending.clearPending()
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
    statusPending,
    translation,
    clearPersistedTranslation,
    composerMode,
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

  const handleSchedule = useCallback(
    (sendAt: Date) => {
      const editor = editorRef.current
      if (!editor || !onSchedule) return
      const textContent = editor.getText().trim()
      const htmlContent = editor.getHTML()
      if (!textContent && files.length === 0) return

      onSchedule(
        sendAt,
        textContent ? htmlContent : '📎',
        replyTo?.id ?? null,
        files.length > 0 ? files : undefined,
      )

      editor.commands.clearContent()
      setHasText(false)
      clearFiles()
      clearDraft()
      onClearReply()
    },
    [onSchedule, files, replyTo, clearFiles, clearDraft, onClearReply],
  )

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
        className="px-4 pt-1 min-w-0"
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
        onSchedule={
          onSchedule && !editingMessage ? handleSchedule : undefined
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

import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { MinimalTiptapEditor } from './MinimalTiptapEditor'
import { EditingBanner, ReplyBanner, TranslationBanner } from './MessageInputBanners'
import { MessageAttachmentsRow } from './MessageAttachmentsRow'
import { MessageInputToolbar } from './MessageInputToolbar'
import { composerSendButtonClass } from './ComposerVisibilitySwitch'
import { isHtmlContent, plainTextToHtml } from '@/utils/format/messengerHtml'
import { useDraftMessage } from './hooks/useDraftMessage'
import { useMessageFiles } from './hooks/useMessageFiles'
import { useEditorResizer } from './hooks/useEditorResizer'
import { useQuoteInsertion } from './hooks/useQuoteInsertion'
import { useComposerTranslation } from './hooks/useComposerTranslation'
import { useComposerFocus } from './hooks/useComposerFocus'
import { useComposerSubmit } from './hooks/useComposerSubmit'
import type { MessageInputProps } from './MessageInput.types'

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
  sendBlockedReason,
  composerMode = 'client',
  statusPending,
  mentionItems,
}: MessageInputProps) {
  const [hasText, setHasText] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [openQuickReplyPicker, setOpenQuickReplyPicker] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const {
    editorMinHeight,
    editorMaxHeight,
    handleResizerMouseDown,
    bumpEditorHeight,
    resetEditorHeight,
  } = useEditorResizer()

  const draftKey = threadId ? `msg_draft:${threadId}` : `msg_draft:${projectId}:${channel}`
  const translationKey = threadId
    ? `msg_translation:${threadId}`
    : `msg_translation:${projectId}:${channel}`

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

  // Вся фокус-логика композера (автофокус, возврат после отправки/ответа,
  // восстановление после сетевой ошибки, трекинг «был ли фокус в этом треде»).
  const { hasBeenFocusedRef } = useComposerFocus({
    editor,
    editorRef,
    threadId,
    isPending,
    replyTo,
    setHasText,
  })

  useQuoteInsertion(editor, quoteText, quoteNonce, hasBeenFocusedRef, onClearQuote)

  // Плашка «Переведено»: состояние перевода, его persistence, восстановление
  // после reload, применение/откат. Связная забота — вынесена в хук.
  const {
    translation,
    setTranslation,
    clearPersistedTranslation,
    handleTranslated,
    handleRevertTranslation,
  } = useComposerTranslation({ editorRef, editor, translationKey, editingMessage, setHasText })

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
  }, [editor, insertContentRef, hasBeenFocusedRef])

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

  const { handleSend, handleSchedule, handleSaveDraft } = useComposerSubmit({
    editorRef,
    editingMessage,
    isPending,
    files,
    existingAttachments,
    threadId,
    replyTo,
    composerMode,
    sendBlockedReason,
    isTaskThread,
    effectivePendingStatusId,
    statusPending,
    translation,
    onSend,
    onEdit,
    onClearReply,
    onClearEdit,
    onSaveDraft,
    onSchedule,
    setHasText,
    setTranslation,
    clearPersistedTranslation,
    clearFiles,
    clearDraft,
    skipDraftRestoreRef,
    onSent: resetEditorHeight,
  })

  const totalFiles = files.length + existingAttachments.length + forwardedAttachments.length
  const hasAnyFiles = totalFiles > 0
  // В задачах кнопка отправки активна даже без текста/файлов, если в пикере
  // статуса выбран новый статус — тогда отправка просто применит его.
  const hasPendingStatus = !!(isTaskThread && effectivePendingStatusId)
  const hasContent = hasText || hasAnyFiles || hasPendingStatus

  return (
    <div
      ref={containerRef}
      data-composer-root
      className="border-t relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-20 flex items-center justify-center group"
        onMouseDown={handleResizerMouseDown}
        onDoubleClick={() => {
          bumpEditorHeight(500)
          // Курсор — в поле (focus() без аргумента восстанавливает прежнюю позицию).
          editorRef.current?.commands.focus()
        }}
        title="Потяните, чтобы изменить высоту · двойной клик — +500px"
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

      <div className="px-4 pt-1 min-w-0">
        <MinimalTiptapEditor
          editorRef={editorRef}
          onSend={handleSend}
          onSlash={() => setOpenQuickReplyPicker(true)}
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
          editorMinHeight={editorMinHeight}
          mentionItems={mentionItems}
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
        taskStatusPicker={
          statusPending?.isTaskThread
            ? {
                statuses: statusPending.taskStatuses,
                currentStatusId: statusPending.currentStatusId,
                pendingStatusId: statusPending.effectivePendingStatusId,
                onPick: statusPending.handlePickStatus,
              }
            : undefined
        }
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
        sendButtonClassName={composerSendButtonClass(composerMode, accent)}
        sendBlockedReason={sendBlockedReason}
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

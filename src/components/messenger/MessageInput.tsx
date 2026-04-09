import { useState, useRef, useCallback, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { MessengerAccent } from './MessageBubble'
import { MinimalTiptapEditor } from './MinimalTiptapEditor'
import { EditingBanner, ReplyBanner } from './MessageInputBanners'
import { MessageAttachmentsRow } from './MessageAttachmentsRow'
import { MessageInputToolbar } from './MessageInputToolbar'
import type { ForwardedAttachment } from '@/services/api/messenger/messengerService'
import { isHtmlContent, plainTextToHtml } from '@/utils/format/messengerHtml'
import { useDraftMessage } from './hooks/useDraftMessage'
import { useMessageFiles } from './hooks/useMessageFiles'
import { useEditorResizer } from './hooks/useEditorResizer'

interface MessageInputProps {
  projectId: string
  channel: string
  workspaceId: string
  threadId?: string
  replyTo: ProjectMessage | null
  onClearReply: () => void
  onSend: (content: string, replyToId?: string | null, files?: File[]) => void
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
}: MessageInputProps) {
  const [hasText, setHasText] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [openQuickReplyPicker, setOpenQuickReplyPicker] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { editorMaxHeight, handleResizerMouseDown } = useEditorResizer()

  const draftKey = threadId ? `msg_draft:${threadId}` : `msg_draft:${projectId}:${channel}`

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

  // Auto-focus editor when thread changes or component mounts
  useEffect(() => {
    if (editorRef.current) {
      // Небольшая задержка, чтобы панель успела анимироваться
      const timer = setTimeout(() => editorRef.current?.commands.focus('end'), 150)
      return () => clearTimeout(timer)
    }
  }, [threadId, editor])

  // Focus editor on reply
  useEffect(() => {
    if (replyTo && editorRef.current) {
      editorRef.current.commands.focus('end')
    }
  }, [replyTo])

  // Insert quote
  const onClearQuoteRef = useRef(onClearQuote)
  useEffect(() => {
    onClearQuoteRef.current = onClearQuote
  }, [onClearQuote])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !quoteText) return
    const paragraphs = quoteText
      .split('\n')
      .filter((line, i, arr) => {
        if (line.trim() === '' && i > 0 && i < arr.length - 1) return false
        return true
      })
      .map((line) => {
        const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return `<p>${escaped || '<br>'}</p>`
      })
      .join('')
    editor.chain().focus().insertContent(`<blockquote>${paragraphs}</blockquote><p></p>`).run()
    onClearQuoteRef.current?.()
  }, [quoteText])

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

    if ((!textContent && files.length === 0) || isPending) return
    onSend(textContent ? htmlContent : '📎', replyTo?.id, files.length > 0 ? files : undefined)
    editor.commands.clearContent()
    setHasText(false)
    clearFiles()
    clearDraft()
    onClearReply()
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
  ])

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
  const hasContent = hasText || hasAnyFiles

  return (
    <div
      ref={containerRef}
      className="border-t relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Resizer handle */}
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

      {/* Editor area */}
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
      />
    </div>
  )
}

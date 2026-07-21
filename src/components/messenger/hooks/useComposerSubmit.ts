import { useCallback, type Dispatch, type SetStateAction, type MutableRefObject } from 'react'
import type { Editor } from '@tiptap/react'
import { ATTACHMENT_PLACEHOLDER } from '@/lib/messenger/attachmentPlaceholder'
import { MODE_VISIBILITY, type ComposerMode } from '../ComposerVisibilitySwitch'
import { extractMentionIds } from '../messengerMention'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { ComposerTranslation } from './useComposerTranslation'
import type { MessageInputProps } from '../MessageInput.types'

type ExistingAttachment = { id: string }

/**
 * Три обработчика отправки композера: handleSend (отправка/правка сообщения),
 * handleSchedule (отложенная отправка), handleSaveDraft (сохранить черновик).
 *
 * Вынесено из MessageInput.tsx (аудит 2026-07-13) — логика не менялась. Все три
 * зеркалят друг друга в части «видимость обязана уехать в черновик/отправку»
 * (иначе внутреннее сообщение созреет с DEFAULT 'client' и утечёт клиенту —
 * Фаза 2.1 аудита), поэтому держатся вместе.
 */
export function useComposerSubmit(deps: {
  editorRef: MutableRefObject<Editor | null>
  editingMessage: ProjectMessage | null
  isPending: boolean
  files: File[]
  existingAttachments: ExistingAttachment[]
  threadId?: string
  replyTo: ProjectMessage | null
  composerMode: ComposerMode
  sendBlockedReason?: string | null
  isTaskThread: boolean
  effectivePendingStatusId: string | null
  statusPending?: MessageInputProps['statusPending']
  translation: ComposerTranslation | null
  onSend: MessageInputProps['onSend']
  onEdit: MessageInputProps['onEdit']
  onClearReply: () => void
  onClearEdit: () => void
  onSaveDraft?: MessageInputProps['onSaveDraft']
  onSchedule?: MessageInputProps['onSchedule']
  setHasText: Dispatch<SetStateAction<boolean>>
  setTranslation: Dispatch<SetStateAction<ComposerTranslation | null>>
  clearPersistedTranslation: () => void
  clearFiles: () => void
  clearDraft: () => void
  skipDraftRestoreRef: MutableRefObject<boolean>
  /** Вызывается после реальной отправки (не черновик) — напр. сброс высоты поля. */
  onSent?: () => void
}): {
  handleSend: () => void
  handleSchedule: (sendAt: Date) => void
  handleSaveDraft: () => void
} {
  const {
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
    onSent,
  } = deps

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
    // Email-черновик без темы/получателя — отправку не пускаем (кнопка тоже
    // disabled, но Enter идёт мимо неё).
    if (sendBlockedReason) return

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
      const ed = editorRef.current
      const mentions = ed ? extractMentionIds(ed) : []
      const options = {
        ...(translation
          ? {
              originalContent: translation.originalContent,
              originalLanguage: translation.sourceLanguage,
            }
          : {}),
        visibility: vis.visibility,
        notifySubscribers: vis.notifySubscribers,
        mentions,
      }
      onSend(
        textContent ? htmlContent : ATTACHMENT_PLACEHOLDER,
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
      onSent?.()
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
    setTranslation,
    clearPersistedTranslation,
    composerMode,
    sendBlockedReason,
    editorRef,
    setHasText,
    onSent,
  ])

  const handleSchedule = useCallback(
    (sendAt: Date) => {
      const editor = editorRef.current
      if (!editor || !onSchedule) return
      // Отложенная отправка email тоже требует темы/получателя.
      if (sendBlockedReason) return
      const textContent = editor.getText().trim()
      const htmlContent = editor.getHTML()
      if (!textContent && files.length === 0) return

      // Видимость обязана уехать в черновик, иначе внутреннее сообщение
      // («Команде»/«Заметка»/«Только я») созреет с DEFAULT 'client' и cron
      // отправит его клиенту. Зеркалит handleSend. (Фаза 2.1 аудита.)
      const vis = MODE_VISIBILITY[composerMode]
      onSchedule(
        sendAt,
        textContent ? htmlContent : ATTACHMENT_PLACEHOLDER,
        replyTo?.id ?? null,
        files.length > 0 ? files : undefined,
        { visibility: vis.visibility, notifySubscribers: vis.notifySubscribers },
      )

      editor.commands.clearContent()
      setHasText(false)
      clearFiles()
      clearDraft()
      onClearReply()
      onSent?.()
    },
    [onSchedule, files, replyTo, clearFiles, clearDraft, onClearReply, sendBlockedReason, composerMode, editorRef, setHasText, onSent],
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
      // Видимость в черновик — иначе при публикации внутренний черновик утечёт
      // клиенту (publishDraftMessage гейтит по message.visibility из БД).
      const vis = MODE_VISIBILITY[composerMode]
      onSaveDraft(textContent ? htmlContent : '', files.length > 0 ? files : undefined, {
        visibility: vis.visibility,
        notifySubscribers: vis.notifySubscribers,
      })
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
    composerMode,
    editorRef,
    setHasText,
  ])

  return { handleSend, handleSchedule, handleSaveDraft }
}

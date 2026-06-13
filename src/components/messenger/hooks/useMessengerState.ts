/**
 * Core state and data hooks for MessengerTabContent
 */

import { useCallback, useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { checkEmailAttachmentsLimit } from './useMessengerHandlers'
import { messengerParticipantKeys, projectThreadKeys } from '@/hooks/queryKeys'
import {
  useProjectMessages,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  useMarkAsRead,
  useMarkAsUnread,
  useUnreadCount,
  useLastReadAt,
  useToggleReaction,
  useTelegramLink,
  useTypingIndicator,
  useMessageSearch,
  useSaveDraft,
  useUpdateDraft,
  usePublishDraft,
  useRetryTelegramSend,
} from '@/hooks/messenger'
import { useWazzupMarkRead } from '@/hooks/messenger/useWazzupMarkRead'
import type { MessageChannel } from '@/services/api/messenger/messengerService'
import { useWorkspacePermissions } from '@/hooks/permissions/useWorkspacePermissions'
import {
  resolveParticipantFull,
  type ProjectMessage,
} from '@/services/api/messenger/messengerService'
import {
  useIsManuallyUnread,
  useHasUnreadReaction,
  useUnreadEventCount,
} from '@/hooks/messenger/useInbox'
import { useDelayedSend } from '@/hooks/messenger/useDelayedSend'
import { useThreadAuditEvents } from '@/hooks/messenger/useThreadAuditEvents'
import { useEmailLink } from '@/hooks/email/useEmailLink'
import { useSendEmail } from '@/hooks/email/useSendEmail'
import { useChatState } from '@/hooks/messenger/useChatState'
import { useDocumentPickerLogic } from './useDocumentPickerLogic'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { useForwardedAttachmentsDraft } from './useForwardedAttachmentsDraft'

type UseMessengerStateParams = {
  projectId?: string
  workspaceId: string
  channel: MessageChannel
  /**
   * Обязательный thread id — хук не поддерживает legacy-режим без треда
   * после audit S1 cleanup. `MessengerTabContent` должен делать early return
   * если треда нет, а не звать этот хук.
   */
  threadId: string
  telegramDialogOpen: boolean
}

export function useMessengerState({
  projectId,
  workspaceId,
  channel,
  threadId,
  telegramDialogOpen,
}: UseMessengerStateParams) {
  const { user } = useAuth()

  const [replyTo, setReplyTo] = useState<ProjectMessage | null>(null)
  const [editingMessage, setEditingMessage] = useState<ProjectMessage | null>(null)
  // `quote` хранит и текст, и nonce — счётчик, который растёт на каждый
  // setQuoteText, даже если текст совпадает с предыдущим. Иначе при повторе
  // того же выделения useEffect в useQuoteInsertion не сработает (значение
  // string не меняется → не считается обновлением), и цитата «не вставляется».
  const [quote, setQuote] = useState<{ text: string; nonce: number } | null>(null)
  const setQuoteText = useCallback((text: string | null) => {
    if (text === null) {
      setQuote(null)
    } else {
      setQuote((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }))
    }
  }, [])
  const quoteText = quote?.text ?? null
  const quoteNonce = quote?.nonce ?? 0
  // Персистится в localStorage по треду — переживает переход на другой диалог
  // и обратно (см. useForwardedAttachmentsDraft).
  const [forwardedAttachments, setForwardedAttachments] = useForwardedAttachmentsDraft(threadId)
  const [sendTrigger, setSendTrigger] = useState(0)

  // Single RPC `get_chat_state` warm-loads participant + telegram link + email
  // link + unread count + last_read_at в один запрос вместо 5-6 параллельных.
  // Результат сидится в существующие React Query кеши через
  // queryClient.setQueryData, поэтому хуки `useUnreadCount`, `useTelegramLink`,
  // `useEmailLink` ниже подхватывают данные без собственных HTTP-запросов.
  useChatState(threadId, projectId, workspaceId, channel)

  const { isLinked, telegramLink, linkCode, isLoadingCode, unlink, isUnlinking } = useTelegramLink(
    projectId,
    channel,
    threadId,
    telegramDialogOpen,
  )

  const { data: emailLink } = useEmailLink(threadId)
  // Тип треда — нужен чтобы знать, что это email до того, как появится
  // запись в project_thread_email_links (она создаётся только после первого
  // обмена). Без этого свежесозданный email-тред считался не-email,
  // и optimistic-сообщение разбивалось на 2 бабла (текст + файлы).
  const { data: threadRow } = useQuery({
    queryKey: projectThreadKeys.type(threadId),
    queryFn: async () => {
      if (!threadId) return null
      const { data } = await supabase
        .from('project_threads')
        .select('type')
        .eq('id', threadId)
        .maybeSingle()
      return (data as { type?: string } | null) ?? null
    },
    enabled: !!threadId,
    staleTime: 60_000,
  })
  const isEmailChat = !!emailLink || threadRow?.type === 'email'

  const { data: currentParticipant } = useQuery({
    queryKey: messengerParticipantKeys.current(projectId ?? workspaceId, user?.id),
    // Каскад project→workspace (фоллбэк для owner/менеджера без записи в
    // project_participants) живёт в resolveParticipantFull — см. ledger
    // 2026-06-12. Раньше был инлайн-копией.
    queryFn: () => resolveParticipantFull(projectId, workspaceId, user!.id),
    enabled: !!(projectId || workspaceId) && !!user,
    staleTime: Infinity,
  })

  const {
    messages,
    isLoading,
    fetchOlderMessages,
    hasMoreOlder,
    isFetchingOlder,
    latestPageMessageCount,
  } = useProjectMessages(projectId, channel, threadId)

  const { data: auditEvents = [] } = useThreadAuditEvents(threadId)

  const sendMessage = useSendMessage(
    projectId,
    workspaceId,
    currentParticipant ?? undefined,
    channel,
    threadId,
    { isEmailChat },
  )
  const sendEmail = useSendEmail(projectId ?? '', workspaceId, threadId)

  const editMessageMutation = useEditMessage(threadId)
  const deleteMessageMutation = useDeleteMessage(threadId)
  const saveDraftMutation = useSaveDraft(projectId, workspaceId, channel, threadId)
  const updateDraftMutation = useUpdateDraft(projectId, workspaceId, channel, threadId)
  const publishDraftMutation = usePublishDraft(projectId, workspaceId, channel, threadId)
  const retryTelegramSendMutation = useRetryTelegramSend(threadId)

  const {
    sendDelay,
    sendWithDelay,
    scheduleExistingDraft,
    cancelDelayedSend,
    isPending: isDelayedPending,
    getExpiresAt,
  } = useDelayedSend(projectId, workspaceId, channel, threadId)

  const { isOwner, can } = useWorkspacePermissions({ workspaceId })
  const isAdmin = isOwner || can('edit_all_projects')

  const pid = currentParticipant?.participantId
  const markAsRead = useMarkAsRead(projectId, workspaceId, channel, pid, threadId)
  const markAsUnread = useMarkAsUnread(projectId, workspaceId, channel, pid, threadId)
  const { data: unreadCount = 0 } = useUnreadCount(workspaceId, threadId)
  // Если тред Wazzup'овский — синхронизируем «прочитано» с WhatsApp.
  // Хук сам проверит wazzup_channel_id и не пойдёт во внешний invoke
  // для не-Wazzup тредов (Зона 8 рефакторинга).
  useWazzupMarkRead(projectId, threadId, unreadCount)
  const { data: isManuallyUnread = false } = useIsManuallyUnread(
    workspaceId,
    projectId ?? '',
    channel,
    threadId,
  )
  const { data: hasUnreadReaction = false } = useHasUnreadReaction(
    workspaceId,
    projectId ?? '',
    channel,
    threadId,
  )
  const { data: unreadEventCount = 0 } = useUnreadEventCount(workspaceId, threadId)
  const { data: lastReadAt, isPending: isLastReadAtPending } = useLastReadAt(
    workspaceId,
    threadId,
  )
  const toggleReaction = useToggleReaction(projectId, channel, pid, workspaceId, threadId)

  const { typingUsers, startTyping, stopTyping } = useTypingIndicator(
    projectId,
    currentParticipant?.participantId ?? null,
    currentParticipant?.name ?? null,
    channel,
    threadId,
  )

  const { searchQuery, setSearchQuery, searchResults, isSearching, isSearchActive, resultCount } =
    useMessageSearch(projectId, channel, threadId)

  const documentPickerLogic = useDocumentPickerLogic(projectId ?? '', workspaceId)

  // Handle pending initial message from chat creation
  const pendingInitialMessage = useSidePanelStore((s) => s.pendingInitialMessage)
  const setPendingInitialMessage = useSidePanelStore((s) => s.setPendingInitialMessage)
  const initialSendStartedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingInitialMessage || !threadId) return
    if (pendingInitialMessage.threadId !== threadId) return
    if (initialSendStartedRef.current === threadId) return
    initialSendStartedRef.current = threadId

    const pending = pendingInitialMessage
    setPendingInitialMessage(null)

    // Лимит вложений для email (тот же, что в handleSend). Этот путь
    // обходит handleSend (вызывается напрямую при создании треда через
    // шаблон), поэтому проверка здесь продублирована — иначе тяжёлые
    // вложения падают в edge function по WORKER_RESOURCE_LIMIT.
    if (pending.isEmail && pending.files.length > 0) {
      const check = checkEmailAttachmentsLimit(pending.files)
      if (!check.ok) {
        toast.error(
          `Слишком большой объём вложений: ${check.totalMb} МБ. За одно письмо принимается не больше 15 МБ. Разбейте на несколько писем.`,
          { duration: 8000 },
        )
        // initialSendStartedRef уже выставлен — намеренно. Не пытаемся
        // отправить повторно с теми же файлами; юзер сам решит, что делать.
        return
      }
    }

    // Унифицированный путь: всё (включая email) идёт через INSERT в project_messages.
    // БД-триггер сам разрулит — если тред type='email' / есть email-история /
    // привязан email_send_account_id, дёрнет email-internal-send Edge Function,
    // которая роутит между Gmail сотрудника и Resend.
    //
    // isEmailChat передаём явно из pending — на момент маунта свежесозданного
    // треда useEmailLink/thread.type ещё не успели загрузиться. Без явного
    // флага optimistic split'ился на 2 баббла (текст + файлы).
    sendMessage.mutate({
      content: pending.html,
      attachments: pending.files.length > 0 ? pending.files : undefined,
      isEmailChat: pending.isEmail,
    })
  }, [pendingInitialMessage, threadId, sendMessage, setPendingInitialMessage])

  // Подхватываем документы, проброшенные из FloatingBatchActions → sendDocumentsToMessenger
  const pendingMessengerDocuments = useSidePanelStore((s) => s.pendingMessengerDocuments)
  const clearPendingMessengerDocuments = useSidePanelStore((s) => s.clearPendingMessengerDocuments)
  const handleConfirmDocPickerRef = useRef(documentPickerLogic.handleConfirmDocPicker)
  useEffect(() => {
    handleConfirmDocPickerRef.current = documentPickerLogic.handleConfirmDocPicker
  })
  useEffect(() => {
    if (!pendingMessengerDocuments) return
    if (pendingMessengerDocuments.channel !== channel) return
    clearPendingMessengerDocuments()
    handleConfirmDocPickerRef.current(new Set(pendingMessengerDocuments.ids))
  }, [pendingMessengerDocuments, channel, clearPendingMessengerDocuments])

  const showUnread =
    unreadCount > 0 || isManuallyUnread || hasUnreadReaction || unreadEventCount > 0

  return {
    // Auth & participant
    user,
    currentParticipant,
    isAdmin,
    // Messages
    messages,
    auditEvents,
    isLoading,
    fetchOlderMessages,
    hasMoreOlder,
    isFetchingOlder,
    latestPageMessageCount,
    // Mutations
    sendMessage,
    sendEmail,
    editMessageMutation,
    deleteMessageMutation,
    saveDraftMutation,
    updateDraftMutation,
    publishDraftMutation,
    retryTelegramSendMutation,
    // Delayed send
    sendDelay,
    sendWithDelay,
    scheduleExistingDraft,
    cancelDelayedSend,
    isDelayedPending,
    getExpiresAt,
    // Read/unread
    markAsRead,
    markAsUnread,
    showUnread,
    lastReadAt,
    isLastReadAtPending,
    // Reactions
    toggleReaction,
    // Typing
    typingUsers,
    startTyping,
    stopTyping,
    // Search
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    isSearchActive,
    resultCount,
    // Document picker
    documentPickerLogic,
    // Telegram
    isLinked,
    telegramLink,
    linkCode,
    isLoadingCode,
    unlink,
    isUnlinking,
    // Email
    emailLink,
    isEmailChat,
    // Local state
    replyTo,
    setReplyTo,
    editingMessage,
    setEditingMessage,
    quoteText,
    quoteNonce,
    setQuoteText,
    forwardedAttachments,
    setForwardedAttachments,
    sendTrigger,
    setSendTrigger,
  }
}

/**
 * Main container for "Messages" tab
 */

import { useState, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { MessageChannel } from '@/services/api/messenger/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'
import { MessageList } from './MessageList'
import type { MessengerAccent } from './MessageBubble'
import { MessengerProvider } from './MessengerContext'
import { MessageInput } from './MessageInput'
import { ForwardBufferBar } from './ForwardBufferBar'
import { TelegramLinkDialog } from './TelegramLinkDialog'
import { ThreadHealthBanner } from './ThreadHealthBanner'
import { EmailLinkDialog } from './EmailLinkDialog'
import { TypingIndicator } from './TypingIndicator'
import { DocumentPickerDialog } from './DocumentPickerDialog'
import { ChatToolbar } from './ChatToolbar'
import { ReadUnreadButton } from './ReadUnreadButton'
import {
  ComposerVisibilitySwitch,
  type ComposerMode,
  type NotifyRecipients,
} from './ComposerVisibilitySwitch'
import { useThreadSubscribers } from '@/hooks/messenger/useThreadSubscription'
import { CLIENT_ROLES } from './chatSettingsTypes'
import { useWorkspacePermissions } from '@/hooks/permissions/useWorkspacePermissions'
import { useTaskStatusPending } from './hooks/useTaskStatusPending'
import { useProjectParticipants } from './hooks/useChatSettingsData'
import { EmailSubjectBar } from './EmailSubjectBar'
import { useMessengerState } from './hooks/useMessengerState'
import { useMessengerHandlers } from './hooks/useMessengerHandlers'
import { useOptimisticEmail } from './hooks/useOptimisticEmail'
import { useProjectThreads, useProjectThreadById } from '@/hooks/messenger/useProjectThreads'
import { useThreadHasClient } from '@/hooks/messenger/useThreadHasClient'
import {
  useBackfillTelegramHistory,
  useIsMtprotoThread,
} from '@/hooks/messenger/useBackfillTelegramHistory'
import { useScheduleMessage } from '@/hooks/messenger/useScheduleMessage'
import { useSidePanelStore } from '@/store/sidePanelStore'
import type { ForwardBufferItem } from '@/store/sidePanelStore'
import { buildForwardContent, toForwardedAttachments, type ForwardMode } from '@/utils/messenger/forwardContent'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

type MessengerTabContentProps = {
  projectId?: string
  workspaceId: string
  accent?: MessengerAccent
  channel?: MessageChannel
  /**
   * Обязательный thread id — компонент работает только с конкретным тредом
   * после audit S1 cleanup. Родитель обязан скрыть компонент, если треда нет.
   */
  threadId: string
  toolbarPortalContainer?: HTMLDivElement | null
}

const COMPOSER_MODES: ComposerMode[] = ['client', 'team', 'note', 'self']
function readStoredComposerMode(key: string | null): ComposerMode | null {
  if (!key || typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(key)
    return v && (COMPOSER_MODES as string[]).includes(v) ? (v as ComposerMode) : null
  } catch {
    return null
  }
}

export function MessengerTabContent({
  projectId,
  workspaceId,
  accent = 'blue',
  channel = 'client',
  threadId,
  toolbarPortalContainer,
}: MessengerTabContentProps) {
  const queryClient = useQueryClient()
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [jumpToMessageId, setJumpToMessageId] = useState<string | null>(null)
  const { user } = useAuth()
  // Режим видимости композера (Клиенту/Команде/Заметка/Только я) — сохраняется
  // per-user-per-thread в localStorage; в памяти держим выбор текущей сессии.
  const modeStorageKey = user?.id ? `cc:composer-mode:${user.id}:${threadId}` : null
  const [modeByThread, setModeByThread] = useState<Record<string, ComposerMode>>({})
  const composerMode: ComposerMode =
    modeByThread[threadId] ?? readStoredComposerMode(modeStorageKey) ?? 'client'
  const setComposerMode = useCallback(
    (m: ComposerMode) => {
      setModeByThread((prev) => ({ ...prev, [threadId]: m }))
      if (modeStorageKey) {
        try {
          localStorage.setItem(modeStorageKey, m)
        } catch {
          /* quota */
        }
      }
    },
    [threadId, modeStorageKey],
  )
  const { data: allThreads = [] } = useProjectThreads(projectId)
  const forwardBuffer = useSidePanelStore((s) => s.forwardBuffer)
  const removeFromForwardBuffer = useSidePanelStore((s) => s.removeFromForwardBuffer)
  const clearForwardBuffer = useSidePanelStore((s) => s.clearForwardBuffer)
  const insertContentRef = useRef<((html: string) => void) | null>(null)
  // Текущий зритель — клиент: ему не показываем внутреннюю подсветку «сотрудник».
  const { isClientOnly } = useWorkspacePermissions({ workspaceId })
  // Тред догружаем напрямую — нужен contact_participant_id (для personal-тредов
  // его нет в allThreads). React Query дедуплицирует с useProjectThreadById в TaskPanel.
  const { data: directThread } = useProjectThreadById(threadId, true)
  const currentThread = allThreads.find((t) => t.id === threadId) ?? directThread ?? undefined
  const hasClientParticipant = useThreadHasClient(currentThread)
  // Кандидаты для @-упоминаний — участники проекта этого треда (у личных тредов
  // без проекта список пуст).
  const { data: projectParticipants = [] } = useProjectParticipants(
    currentThread?.project_id ?? undefined,
  )
  const mentionItems = useMemo(
    () =>
      projectParticipants
        // Себя не упоминаем — убираем текущего пользователя из списка.
        .filter((p) => p.user_id !== user?.id)
        .map((p) => ({
          id: p.id,
          label: [p.name, p.last_name].filter(Boolean).join(' '),
          avatarUrl: p.avatar_url,
        })),
    [projectParticipants, user?.id],
  )
  // Пикер статуса (Planfix-style) — поднят сюда, чтобы стоять в одной линии с
  // кнопкой read/unread и селектором видимости. Статус коммитится при отправке
  // (логика в MessageInput, ему передаём statusPending).
  const statusPending = useTaskStatusPending({
    threadId,
    projectId: projectId ?? '',
    workspaceId,
    threadType: currentThread?.type,
    threadStatusId: currentThread?.status_id ?? null,
  })

  // Чужой личный диалог: тред без проекта, владелец которого — не текущий
  // пользователь (владелец воркспейса / менеджер смотрит переписку сотрудника).
  // В таком треде не подсвечиваем «непрочитанное» — это не наша переписка,
  // красный контур на всех сообщениях бессмыслен.
  const isForeignPersonalThread =
    !!currentThread &&
    currentThread.project_id === null &&
    !!currentThread.owner_user_id &&
    currentThread.owner_user_id !== user?.id

  // MTProto-бэкфилл истории через `Api.messages.GetHistory`. Кнопка
  // «Загрузить ещё из Telegram» появляется в MessageList только когда тред
  // действительно подключён к MTProto-сессии.
  const isMtprotoThread = useIsMtprotoThread(threadId)
  const backfillMutation = useBackfillTelegramHistory(threadId)

  const state = useMessengerState({
    projectId,
    workspaceId,
    channel,
    threadId,
    telegramDialogOpen,
  })

  // Есть ли у треда внешний собеседник/клиент. Если нет (внутренний тред
  // команды) — режим «Клиенту» в композере прячем, дефолт сводим к «Команде».
  // Личные диалоги (Business/Wazzup/MTProto) — клиент есть, режим оставляем.
  const allowClientMode =
    hasClientParticipant ||
    state.isLinked ||
    !!state.emailLink ||
    !!currentThread?.business_connection_id ||
    !!currentThread?.wazzup_channel_id ||
    isMtprotoThread
  // Эффективный режим: при скрытом «Клиенту» сохранённый/дефолтный 'client'
  // съезжает на 'team' (иначе активной кнопки нет).
  const effectiveComposerMode: ComposerMode =
    !allowClientMode && composerMode === 'client' ? 'team' : composerMode

  // «Кто получит уведомление» для подсказки при наведении на режим. Лениво:
  // подписчики тянутся только после первого наведения (primed), кэш — на тред.
  const [recipientsPrimed, setRecipientsPrimed] = useState(false)
  const threadSubscribers = useThreadSubscribers(threadId, workspaceId, recipientsPrimed)
  const composerRecipients = useMemo<NotifyRecipients>(() => {
    // get_thread_subscribers отдаёт ВСЕХ с доступом к треду + флаг подписки.
    // Доступ = все сотрудники тут; уведомление = из них подписанные.
    const byId = new Map(projectParticipants.map((p) => [p.id, p]))
    const clientRoles = CLIENT_ROLES as readonly string[]
    const accessStaff: string[] = []
    const notifyStaff: string[] = []
    let accessExtra = 0
    let notifyExtra = 0
    let hasClient = false
    for (const [id, subscribed] of Object.entries(threadSubscribers.subscribers)) {
      const p = byId.get(id)
      if (!p) {
        accessExtra++ // доступ есть (assignee/member вне проекта), имя неизвестно
        if (subscribed) notifyExtra++
        continue
      }
      if (p.user_id && p.user_id === user?.id) continue // себя не показываем
      if ((p.project_roles ?? []).some((r) => clientRoles.includes(r))) {
        hasClient = true // клиент — в командные списки не кладём
        continue
      }
      const name = [p.name, p.last_name].filter(Boolean).join(' ') || 'Без имени'
      accessStaff.push(name)
      if (subscribed) notifyStaff.push(name)
    }
    return {
      loading: recipientsPrimed && threadSubscribers.isLoading,
      accessStaff,
      notifyStaff,
      accessExtra,
      notifyExtra,
      hasClient: hasClient || allowClientMode,
    }
  }, [
    threadSubscribers.subscribers,
    threadSubscribers.isLoading,
    recipientsPrimed,
    projectParticipants,
    user?.id,
    allowClientMode,
  ])

  const handlers = useMessengerHandlers({
    channel,
    threadId,
    projectId,
    isEmailChat: state.isEmailChat,
    currentParticipant: state.currentParticipant,
    sendMessage: state.sendMessage,
    sendEmail: state.sendEmail,
    editMessageMutation: state.editMessageMutation,
    saveDraftMutation: state.saveDraftMutation,
    updateDraftMutation: state.updateDraftMutation,
    publishDraftMutation: state.publishDraftMutation,
    retryTelegramSendMutation: state.retryTelegramSendMutation,
    sendDelay: state.sendDelay,
    sendWithDelay: state.sendWithDelay,
    scheduleExistingDraft: state.scheduleExistingDraft,
    cancelDelayedSend: state.cancelDelayedSend,
    replyTo: state.replyTo,
    forwardedAttachments: state.forwardedAttachments,
    stopTyping: state.stopTyping,
    setReplyTo: state.setReplyTo,
    setEditingMessage: state.setEditingMessage,
    setForwardedAttachments: state.setForwardedAttachments,
    setSendTrigger: state.setSendTrigger,
    editingMessage: state.editingMessage,
  })

  const scheduling = useScheduleMessage({
    projectId,
    workspaceId,
    channel,
    threadId,
  })

  const handleSchedule = useCallback(
    async (
      sendAt: Date,
      content: string,
      replyToId?: string | null,
      files?: File[],
    ) => {
      if (!state.currentParticipant) return
      try {
        await scheduling.schedule({
          content,
          sendAt,
          attachments: files,
          replyToId: replyToId ?? null,
          senderParticipantId: state.currentParticipant.participantId,
          senderName: state.currentParticipant.name,
          senderRole: state.currentParticipant.role,
        })
        state.setReplyTo(null)
        state.setSendTrigger((prev) => prev + 1)
        toast.success(
          `Запланировано на ${sendAt.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}`,
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Не удалось запланировать')
      }
    },
    [scheduling, state],
  )

  const handleCancelScheduled = useCallback(
    async (messageId: string) => {
      try {
        await scheduling.cancel(messageId)
      } catch {
        toast.error('Не удалось отменить')
      }
    },
    [scheduling],
  )

  const handleSendScheduledNow = useCallback(
    async (messageId: string) => {
      try {
        await scheduling.sendNow(messageId)
        toast.success('Отправлено')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Не удалось отправить')
      }
    },
    [scheduling],
  )

  const handleReschedule = useCallback(
    async (messageId: string, sendAt: Date) => {
      try {
        await scheduling.reschedule({ messageId, sendAt })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Не удалось перепланировать')
      }
    },
    [scheduling],
  )

  const handleReact = useCallback(
    (msgId: string, emoji: string) => state.toggleReaction.mutate({ messageId: msgId, emoji }),
    [state.toggleReaction],
  )

  const handleDelete = useCallback(
    (messageId: string) => state.deleteMessageMutation.mutate(messageId),
    [state.deleteMessageMutation],
  )

  const handleJumpToMessage = useCallback(
    (messageId: string) => {
      state.setSearchQuery('')
      setSearchOpen(false)
      setJumpToMessageId(messageId)
    },
    [state],
  )

  // «Вставить» из буфера: текстовые блоки → в редактор (цитата/оригинал),
  // файлы → в чипы вложений композера. Вставленные элементы убираем из буфера.
  const handleInsertForward = useCallback(
    (items: ForwardBufferItem[], mode: ForwardMode) => {
      const files = items.flatMap((i) => (i.kind === 'file' ? toForwardedAttachments(i.attachments) : []))
      if (files.length > 0) {
        state.setForwardedAttachments((prev) => [...prev, ...files])
      }
      // Все текстовые блоки вставляем ОДНИМ insertContent — иначе второй вызов
      // приходит курсором внутрь первого blockquote и цитата вкладывается в
      // цитату. Хвостовой <p> выводит курсор из последней цитаты.
      const textHtml = items
        .filter((i) => i.kind === 'text')
        .map((i) => buildForwardContent(i, mode))
        .join('')
      if (textHtml) {
        insertContentRef.current?.(`${textHtml}<p></p>`)
      }
      for (const item of items) removeFromForwardBuffer(item.id)
    },
    [state, removeFromForwardBuffer],
  )

  const displayMessages = useOptimisticEmail({
    messages: state.messages,
    searchResults: state.searchResults,
    isSearchActive: state.isSearchActive,
    projectId,
    workspaceId,
    threadId,
    currentParticipant: state.currentParticipant,
    sendEmail: state.sendEmail,
  })

  const toolbarContent = (
    <ChatToolbar
      searchQuery={state.searchQuery}
      onSearchChange={state.setSearchQuery}
      searchOpen={searchOpen}
      onSearchToggle={() => {
        setSearchOpen(!searchOpen)
        if (searchOpen) state.setSearchQuery('')
      }}
      resultCount={state.resultCount}
      isSearching={state.isSearching}
      isEmailChat={state.isEmailChat}
      isLinked={state.isLinked}
      telegramChatTitle={state.telegramLink?.telegram_chat_title ?? null}
      contactEmail={state.emailLink?.contact_email ?? null}
      onTelegramClick={() => setTelegramDialogOpen(true)}
      onEmailClick={() => setEmailDialogOpen(true)}
    />
  )

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {toolbarPortalContainer ? (
        createPortal(toolbarContent, toolbarPortalContainer)
      ) : (
        <div className="relative flex items-center px-4 py-2 bg-muted/30">
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-border via-border/40 to-transparent" />
          {toolbarContent}
        </div>
      )}

      <MessengerProvider
        currentParticipantId={state.currentParticipant?.participantId ?? null}
        viewerRole={state.currentParticipant?.role}
        projectId={projectId}
        workspaceId={workspaceId}
        accent={accent}
        channel={channel}
        isAdmin={state.isAdmin}
        isTelegramLinked={state.isLinked}
        isClientThread={hasClientParticipant || state.isLinked || !!state.emailLink}
        viewerIsClient={isClientOnly}
        isEmailThread={state.isEmailChat}
        isBusinessThread={!!currentThread?.business_connection_id}
        isWazzupThread={!!currentThread?.wazzup_channel_id}
        threadContactParticipantId={currentThread?.contact_participant_id ?? null}
        onReply={state.setReplyTo}
        onReact={handleReact}
        onEdit={handlers.handleStartEdit}
        onDelete={handleDelete}
        onQuote={state.setQuoteText}
        onForward={handlers.handleForward}
        currentThreadId={threadId}
        onPublishDraft={handlers.handlePublishDraft}
        onEditDraft={handlers.handleEditDraft}
        onRetryTelegramSend={handlers.handleRetryTelegramSend}
        isDelayedPending={state.isDelayedPending}
        getDelayedExpiresAt={state.getExpiresAt}
        onCancelDelayed={handlers.handleCancelDelayed}
        onCancelScheduled={handleCancelScheduled}
        onSendScheduledNow={handleSendScheduledNow}
        onReschedule={handleReschedule}
        isSearchActive={state.isSearchActive}
        onJumpToMessage={handleJumpToMessage}
      >
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
        {state.isEmailChat && (
          <EmailSubjectBar
            subject={state.emailLink?.subject}
            contactEmail={state.emailLink?.contact_email}
          />
        )}

        <ThreadHealthBanner threadId={threadId} workspaceId={workspaceId} />

        <MessageList
          messages={displayMessages}
          isLoading={state.isLoading}
          hasMoreOlder={state.isSearchActive ? false : state.hasMoreOlder}
          isFetchingOlder={state.isFetchingOlder}
          lastReadAt={state.lastReadAt ?? undefined}
          isLastReadAtLoaded={!state.isLastReadAtPending}
          onFetchOlder={state.fetchOlderMessages}
          scrollToBottomTrigger={state.sendTrigger}
          auditEvents={state.auditEvents}
          jumpToMessageId={jumpToMessageId}
          onJumpComplete={() => setJumpToMessageId(null)}
          onBackfillFromTelegram={
            isMtprotoThread ? () => backfillMutation.mutate() : undefined
          }
          isBackfilling={backfillMutation.isPending}
          suppressUnread={isForeignPersonalThread}
        />

        {/* Линия над композером (наезжает на список через negative margin):
            слева — тип сообщения + @, по центру — «Прочитано/Непрочитано». */}
        <div className="relative flex items-center -mt-6 mb-2 z-10 pl-3 pr-5 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            {!state.editingMessage && (
              <ComposerVisibilitySwitch
                mode={effectiveComposerMode}
                onChange={setComposerMode}
                allowClient={allowClientMode}
                recipients={composerRecipients}
                onPrimeRecipients={() => setRecipientsPrimed(true)}
              />
            )}
            {!state.editingMessage && (
              <button
                type="button"
                title="Упомянуть участника"
                onClick={() => insertContentRef.current?.('@')}
                className="h-6 w-6 shrink-0 rounded-full border border-neutral-400 bg-white/80 backdrop-blur-sm shadow-[0_0_18px_6px_rgba(255,255,255,0.9)] flex items-center justify-center text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                @
              </button>
            )}
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto">
            <ReadUnreadButton
              showUnread={state.showUnread}
              onMarkRead={() => state.markAsRead.mutate()}
              onMarkUnread={() => state.markAsUnread.mutate()}
              isMarkReadPending={state.markAsRead.isPending}
              isMarkUnreadPending={state.markAsUnread.isPending}
            />
          </div>
        </div>

        <TypingIndicator typingUsers={state.typingUsers} />

        {/* Селектор «Отправлять от» скрыт по просьбе — письма уходят от текущего
            аккаунта треда (email_send_account_id). EmailSendMethodSelector оставлен
            в коде на случай возврата. */}

        <ForwardBufferBar
          items={forwardBuffer}
          onInsert={handleInsertForward}
          onRemove={removeFromForwardBuffer}
          onClear={clearForwardBuffer}
        />

        <MessageInput
          projectId={projectId ?? ''}
          channel={channel}
          workspaceId={workspaceId}
          threadId={threadId}
          replyTo={state.replyTo}
          onClearReply={() => state.setReplyTo(null)}
          onSend={handlers.handleSend}
          isPending={
            state.sendMessage.isPending ||
            state.sendEmail.isPending ||
            state.editMessageMutation.isPending
          }
          onTyping={state.startTyping}
          accent={accent}
          composerMode={effectiveComposerMode}
          mentionItems={mentionItems}
          editingMessage={state.editingMessage}
          onClearEdit={() => state.setEditingMessage(null)}
          onEdit={handlers.handleEdit}
          quoteText={state.quoteText}
          quoteNonce={state.quoteNonce}
          onClearQuote={() => state.setQuoteText(null)}
          onOpenDocPicker={state.documentPickerLogic.handleOpenDocPicker}
          projectDocumentsCount={state.documentPickerLogic.projectDocuments.length}
          addFilesRef={state.documentPickerLogic.addFilesRef}
          insertContentRef={insertContentRef}
          onDocumentDrop={state.documentPickerLogic.handleDocumentDrop}
          forwardedAttachments={state.forwardedAttachments}
          onRemoveForwardedAttachment={(index) =>
            state.setForwardedAttachments((prev) => prev.filter((_, i) => i !== index))
          }
          onSaveDraft={handlers.handleSaveDraft}
          isSavingDraft={state.saveDraftMutation.isPending}
          onSchedule={handleSchedule}
          statusPending={{
            ...statusPending,
            currentStatusId: currentThread?.status_id ?? null,
          }}
        />
      </div>

      <TelegramLinkDialog
        open={telegramDialogOpen}
        onClose={() => {
          setTelegramDialogOpen(false)
          queryClient.invalidateQueries({
            queryKey: messengerKeys.telegramLinkByThreadId(threadId),
          })
        }}
        isLinked={state.isLinked}
        chatTitle={state.telegramLink?.telegram_chat_title ?? null}
        linkCode={state.linkCode}
        isLoadingCode={state.isLoadingCode}
        onUnlink={state.unlink}
        isUnlinking={state.isUnlinking}
        channel={channel}
      />

      <EmailLinkDialog
        open={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        chatId={threadId}
        emailLink={state.emailLink ?? null}
      />

      <DocumentPickerDialog
        key={state.documentPickerLogic.docPickerKey}
        open={state.documentPickerLogic.docPickerOpen}
        onOpenChange={state.documentPickerLogic.setDocPickerOpen}
        documents={state.documentPickerLogic.projectDocuments}
        statusMap={state.documentPickerLogic.statusMap}
        onConfirm={state.documentPickerLogic.handleConfirmDocPicker}
        confirmLabel="Прикрепить"
        isLoading={state.documentPickerLogic.isDownloading}
      />

      </MessengerProvider>
    </div>
  )
}

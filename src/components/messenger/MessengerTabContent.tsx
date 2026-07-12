/**
 * Main container for "Messages" tab
 */

import { useState, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { MessageChannel, MessageVisibility, ProjectMessage } from '@/services/api/messenger/messengerService'
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
import { ThreadSearchOverlay } from './search/ThreadSearchOverlay'
import { ReadUnreadButton } from './ReadUnreadButton'
import {
  ComposerVisibilitySwitch,
  type ComposerMode,
  type NotifyRecipients,
} from './ComposerVisibilitySwitch'
import { useThreadSubscribers, useIsThreadMutedByMe } from '@/hooks/messenger/useThreadSubscription'
import { CLIENT_ROLES } from './chatSettingsTypes'
import { useWorkspacePermissions } from '@/hooks/permissions/useWorkspacePermissions'
import { useTaskStatusPending } from './hooks/useTaskStatusPending'
import { useProjectParticipants, useThreadMembers } from './hooks/useChatSettingsData'
import { useTaskAssigneeIds } from '@/components/tasks/useTaskAssignees'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { EmailSubjectBar } from './EmailSubjectBar'
import { ThreadDescriptionBlock } from './ThreadDescriptionBlock'
import { useUpdateEmailThreadMeta } from '@/hooks/messenger/useProjectThreads'
import { useEmailSuggestions } from './hooks/useChatSettingsData'
import { useMessengerState } from './hooks/useMessengerState'
import { useMessengerHandlers } from './hooks/useMessengerHandlers'
import { useProjectThreads, useProjectThreadById } from '@/hooks/messenger/useProjectThreads'
import { useThreadHasClient } from '@/hooks/messenger/useThreadHasClient'
import { isClientFacingThread } from '@/utils/messenger/isClientFacingThread'
import {
  useBackfillTelegramHistory,
  useIsMtprotoThread,
} from '@/hooks/messenger/useBackfillTelegramHistory'
import { useScheduleMessage } from '@/hooks/messenger/useScheduleMessage'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { useContactCardStore } from '@/store/contactCardStore'
import type { ForwardBufferItem } from '@/store/sidePanelStore'
import { buildForwardContent, toForwardedAttachments, type ForwardMode } from '@/utils/messenger/forwardContent'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

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
  /** Контейнер для индикатора канала на мобиле (выдвижная панель шапки). */
  channelPortalContainer?: HTMLDivElement | null
}

const COMPOSER_MODES: ComposerMode[] = ['client', 'team', 'note', 'self']

/** Видимость сообщения → режим композера (для подхвата режима при «Ответить»). */
function visibilityToMode(msg: ProjectMessage): ComposerMode {
  if (msg.visibility === 'self') return 'self'
  if (msg.visibility === 'team') return msg.notify_subscribers === false ? 'note' : 'team'
  return 'client' // client / undefined → «Всем»
}
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
  channelPortalContainer,
}: MessengerTabContentProps) {
  const queryClient = useQueryClient()
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false)
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
  const openContactCard = useContactCardStore((s) => s.open)
  const forwardBuffer = useSidePanelStore((s) => s.forwardBuffer)
  const removeFromForwardBuffer = useSidePanelStore((s) => s.removeFromForwardBuffer)
  const clearForwardBuffer = useSidePanelStore((s) => s.clearForwardBuffer)
  const insertContentRef = useRef<((html: string) => void) | null>(null)
  // Текущий зритель — клиент: ему не показываем внутреннюю подсветку «сотрудник».
  const { isClientOnly, can: canWs } = useWorkspacePermissions({ workspaceId })
  // Тред догружаем напрямую — нужен contact_participant_id (для personal-тредов
  // его нет в allThreads). React Query дедуплицирует с useProjectThreadById в TaskPanel.
  const { data: directThread } = useProjectThreadById(threadId, true)
  const currentThread = allThreads.find((t) => t.id === threadId) ?? directThread ?? undefined
  const updateEmailMeta = useUpdateEmailThreadMeta(workspaceId)
  // Подсказки контактов для пикера получателя в шапке email-черновика.
  // type у email-треда в рантайме 'email' (TS-union сужен до chat|task — каст).
  const isEmailTypeThread = (currentThread?.type as string | undefined) === 'email'
  const { data: emailSuggestions = [] } = useEmailSuggestions(
    isEmailTypeThread ? workspaceId : undefined,
  )
  const hasClientParticipant = useThreadHasClient(currentThread)
  // Кандидаты для @-упоминаний — ТОЛЬКО люди, связанные с этой задачей:
  // участники проекта ∪ участники задачи (thread members) ∪ исполнители.
  // Больше никого (лишние сотрудники воркспейса не выводятся). Берём только с
  // аккаунтом (user_id) — telegram-контакты упоминать бессмысленно, они не видят ЛК.
  const { data: projectParticipants = [] } = useProjectParticipants(
    currentThread?.project_id ?? undefined,
  )
  const { data: threadMemberIds } = useThreadMembers(threadId)
  const { data: assigneeIds = [] } = useTaskAssigneeIds(threadId)
  // Полный справочник участников воркспейса — источник имён/аватаров/user_id для
  // резолва id (участники проекта/треда/исполнители — все участники воркспейса).
  const { data: workspaceParticipants = [] } = useWorkspaceParticipants(workspaceId)
  const mentionItems = useMemo(() => {
    // Множество id, кому разрешено попасть в список: три источника.
    const allowed = new Set<string>()
    for (const p of projectParticipants) allowed.add(p.id)
    if (threadMemberIds) for (const id of threadMemberIds) allowed.add(id)
    for (const id of assigneeIds) allowed.add(id)
    return workspaceParticipants
      .filter(
        (p) =>
          p.user_id && // только с аккаунтом (без telegram-контактов)
          p.user_id !== user?.id && // себя не упоминаем
          allowed.has(p.id),
      )
      .map((p) => ({
        id: p.id,
        label: [p.name, p.last_name].filter(Boolean).join(' '),
        avatarUrl: p.avatar_url,
      }))
  }, [workspaceParticipants, projectParticipants, threadMemberIds, assigneeIds, user?.id])
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

  // Служебные события (статус/создание/переименование…) считаются непрочитанными
  // только исполнителю задачи ИЛИ всем, если исполнителей нет вовсе. Зеркалит гейт
  // в БД (recompute_thread_unread_for), чтобы красный контур события в ленте
  // совпадал с бейджем. assigneeIds — participant_id[], сравниваем с моим pid.
  const viewerGetsEvents = useMemo(() => {
    if (assigneeIds.length === 0) return true
    const myPid = state.currentParticipant?.participantId ?? null
    return myPid !== null && assigneeIds.includes(myPid)
  }, [assigneeIds, state.currentParticipant?.participantId])

  // «Ответить» подхватывает режим отвечаемого сообщения (отвечаешь на «Команде»
  // → композер встаёт в «Команде»). Фокус в поле ввода ставит MessageInput по
  // изменению replyTo.
  const handleReply = (msg: ProjectMessage) => {
    state.setReplyTo(msg)
    setComposerMode(visibilityToMode(msg))
  }

  // Клиентский (внешний) тред — ЕДИНЫЙ предикат `isClientFacingThread`. Тот же
  // результат используется и для раскраски баблов (проп isClientThread ниже),
  // чтобы композер и рендер не расходились (иначе команд. сообщения в MTProto
  // не красились в серый). Если внутренний тред команды — режим «Клиенту» в
  // композере прячем, дефолт сводим к «Команде».
  const clientFacingThread = isClientFacingThread({
    hasClientParticipant,
    isTgGroupLinked: state.isLinked,
    isEmailChat: state.isEmailChat, // link ИЛИ type='email'
    isBusiness: !!currentThread?.business_connection_id,
    isWazzup: !!currentThread?.wazzup_channel_id,
    isMtproto: isMtprotoThread,
  })
  const allowClientMode = clientFacingThread
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
    const myParticipantId = state.currentParticipant?.participantId ?? null
    const accessStaff: string[] = []
    const notifyStaff: string[] = []
    let accessExtra = 0
    let notifyExtra = 0
    let hasClient = false
    for (const [id, subscribed] of Object.entries(threadSubscribers.subscribers)) {
      // Себя не показываем — исключаем по participant_id (работает и в личных
      // диалогах без проекта, где participant по имени не разрешается).
      if (myParticipantId && id === myParticipantId) continue
      const p = byId.get(id)
      if (!p) {
        accessExtra++ // доступ есть (assignee/member вне проекта), имя неизвестно
        if (subscribed) notifyExtra++
        continue
      }
      if (p.user_id && p.user_id === user?.id) continue // подстраховка по user_id
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
    state.currentParticipant?.participantId,
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
      options?: { visibility?: MessageVisibility; notifySubscribers?: boolean },
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
          visibility: options?.visibility,
          notifySubscribers: options?.notifySubscribers,
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
        toast.error(getUserFacingErrorMessage(err, 'Не удалось запланировать'))
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
        toast.error(getUserFacingErrorMessage(err, 'Не удалось отправить'))
      }
    },
    [scheduling],
  )

  const handleReschedule = useCallback(
    async (messageId: string, sendAt: Date) => {
      try {
        await scheduling.reschedule({ messageId, sendAt })
      } catch (err) {
        toast.error(getUserFacingErrorMessage(err, 'Не удалось перепланировать'))
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
      setSearchOverlayOpen(false)
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

  // Email-сообщения теперь идут обычным sendMessage → INSERT → Realtime, без
  // отдельного оптимистичного пути (useOptimisticEmail удалён 2026-07-12 —
  // был инертен). Лента = результаты поиска либо обычные сообщения.
  const displayMessages = state.isSearchActive ? state.searchResults : state.messages

  // Заглушённый (mute) МНОЙ тред: непрочитанное не теряется — показываем его
  // внутри треда «тихой» серой подсветкой (в отличие от красной у подписанных)
  // и даём кнопку «Прочитано», чтобы очистить. Пассивное состояние (доступ есть,
  // но не подписан по дефолту) сюда не попадает — там явной mute-строки нет.
  const isMutedByMe = useIsThreadMutedByMe(threadId)
  const hasUnreadByLastRead = useMemo(() => {
    if (state.isLastReadAtPending) return false // ждём last_read_at — не мигаем
    const myPid = state.currentParticipant?.participantId ?? null
    const lr = state.lastReadAt ? Date.parse(state.lastReadAt) : null
    return displayMessages.some(
      (m) =>
        m.sender_participant_id !== myPid &&
        (lr === null || Date.parse(m.created_at) > lr),
    )
  }, [
    displayMessages,
    state.lastReadAt,
    state.isLastReadAtPending,
    state.currentParticipant?.participantId,
  ])
  // Показывать «тихую» подсветку только у заглушённого треда с непрочитанным.
  const mutedUnreadActive = isMutedByMe && !state.showUnread && hasUnreadByLastRead
  const unreadTone: 'red' | 'slate' = state.showUnread ? 'red' : 'slate'

  // Черновик письма: email-тред БЕЗ отправленных сообщений (сохранённый
  // is_draft-баббл не считается отправкой — иначе тред «выходил» из режима
  // черновика и нельзя было поправить получателя). Зеркалит серверный
  // email_unsent (NOT EXISTS is_draft=false), чтобы фронт и список совпадали.
  const hasSentEmail = displayMessages.some((m) => !m.is_draft)
  const isEmailUnsent = state.isEmailChat && !state.isLoading && !hasSentEmail

  // Блокировка отправки email без темы/получателя (Enter + кнопка + тултип).
  const emailRecipient =
    state.emailLink?.contact_email ?? currentThread?.email_last_external_address
  const emailSubjectValue = state.emailLink?.subject ?? currentThread?.email_subject_root
  const sendBlockedReason = useMemo(() => {
    if (!state.isEmailChat) return null
    const missing: string[] = []
    if (!emailRecipient) missing.push('получателя')
    if (!emailSubjectValue) missing.push('тему')
    if (missing.length === 0) return null
    return `Перед отправкой укажите ${missing.join(' и ')} письма`
  }, [state.isEmailChat, emailRecipient, emailSubjectValue])

  const toolbarContent = (
    <ChatToolbar
      onOpenSearch={() => setSearchOverlayOpen(true)}
      isEmailChat={state.isEmailChat}
      isLinked={state.isLinked}
      telegramChatTitle={state.telegramLink?.telegram_chat_title ?? null}
      onTelegramClick={() => setTelegramDialogOpen(true)}
      // Личные диалоги — статичный значок своего канала вместо групповой «розетки».
      isMtproto={isMtprotoThread}
      isBusiness={!!currentThread?.business_connection_id}
      isWazzup={!!currentThread?.wazzup_channel_id}
      wazzupKind={
        /^\+?\d+$/.test(currentThread?.wazzup_chat_id ?? '') ? 'whatsapp' : 'instagram'
      }
      // Клик по значку личного канала → карточка контакта собеседника.
      onChannelIconClick={
        currentThread?.contact_participant_id
          ? () => openContactCard(currentThread.contact_participant_id!)
          : undefined
      }
      // Маленький индикатор подключения email-канала → диалог привязки/отвязки.
      onEmailLinkClick={() => setEmailDialogOpen(true)}
      // Кнопка email-канала в шапке = поповер темы/получателя (с правкой черновика).
      emailBar={
        <EmailSubjectBar
          variant="compact"
          subject={state.emailLink?.subject ?? currentThread?.email_subject_root}
          contactEmail={state.emailLink?.contact_email ?? currentThread?.email_last_external_address}
          editable={isEmailUnsent}
          suggestions={emailSuggestions}
          onSave={(next) =>
            updateEmailMeta.mutate({
              threadId,
              projectId: currentThread?.project_id ?? null,
              ...next,
            })
          }
        />
      }
      channelContainer={channelPortalContainer}
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
        isClientThread={clientFacingThread}
        viewerIsClient={isClientOnly}
        isEmailThread={state.isEmailChat}
        isBusinessThread={!!currentThread?.business_connection_id}
        isWazzupThread={!!currentThread?.wazzup_channel_id}
        threadContactParticipantId={currentThread?.contact_participant_id ?? null}
        onReply={handleReply}
        onReact={handleReact}
        onEdit={canWs('edit_own_message') ? handlers.handleStartEdit : undefined}
        onDelete={handleDelete}
        onQuote={state.setQuoteText}
        onForward={canWs('forward_messages') ? handlers.handleForward : undefined}
        currentThreadId={threadId}
        onPublishDraft={(msg) => {
          // Публикация черновик-баббла = отправка. Для email требуем тему/получателя.
          if (sendBlockedReason) {
            toast.error(sendBlockedReason)
            return
          }
          handlers.handlePublishDraft(msg)
        }}
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
        <ThreadHealthBanner threadId={threadId} workspaceId={workspaceId} />

        {/* Email-тред без единого сообщения = письмо ещё не отправлено (черновик).
            Показываем только на ПУСТОЙ ленте (если есть сохранённый черновик-баббл,
            подсказка по центру наезжала бы на него). */}
        {isEmailUnsent && displayMessages.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
            <div className="max-w-xs text-center text-sm text-muted-foreground">
              <span className="font-medium text-red-700">Черновик письма</span>
              <br />
              Оно ещё не отправлено. Допишите текст и нажмите «Отправить» — письмо
              уйдёт получателю.
            </div>
          </div>
        )}

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
          // Описание треда — первый бабл ленты, скроллится вместе с ней (не
          // закреплён). Пустое → подсказка «Добавить описание». Клиенту не
          // показываем (внутренняя заметка команды).
          headerSlot={
            !isClientOnly ? (
              <ThreadDescriptionBlock
                variant="banner"
                threadId={threadId}
                projectId={currentThread?.project_id ?? null}
                description={directThread?.description ?? null}
              />
            ) : undefined
          }
          onBackfillFromTelegram={
            isMtprotoThread ? () => backfillMutation.mutate() : undefined
          }
          isBackfilling={backfillMutation.isPending}
          // Контуры непрочитанного уважают подписку: гейтим по showUnread (он уже
          // subscription-gated через счётчик thread_unread_state). Не подписан →
          // showUnread=false → контуров нет (как и кнопка «прочитано»), убирает
          // противоречие «красный контур vs кнопка прочитано» у view_all-владельца.
          suppressUnread={
            isForeignPersonalThread || (!state.showUnread && !mutedUnreadActive)
          }
          unreadTone={unreadTone}
          viewerGetsEvents={viewerGetsEvents}
        />

        {/* Линия над композером (наезжает на список через negative margin):
            слева — тип сообщения + @, по центру — «Прочитано/Непрочитано».
            Layout: левая группа и правый пустой спейсер — оба flex-1 (равный
            рост), кнопка между ними shrink-0. Пока хватает места, равные
            распорки держат кнопку по центру строки; когда режимы шире своей
            доли, левая группа не сжимается ниже контента и толкает кнопку
            вправо — наслаивания нет. */}
        <div className="relative flex items-center -mt-6 mb-2 z-10 pl-3 pr-5 pointer-events-none">
          <div className="flex-1 flex items-center gap-2">
            {/* Выбор режима — внутренний инструмент команды; клиенту не показываем. */}
            {!state.editingMessage && !isClientOnly && (
              <div className="shrink-0 pointer-events-auto">
                <ComposerVisibilitySwitch
                  mode={effectiveComposerMode}
                  onChange={setComposerMode}
                  allowClient={allowClientMode}
                  accent={accent}
                  recipients={composerRecipients}
                  onPrimeRecipients={() => setRecipientsPrimed(true)}
                />
              </div>
            )}
            {!state.editingMessage && !isClientOnly && (
              <button
                type="button"
                title="Упомянуть участника"
                onClick={() => insertContentRef.current?.('@')}
                className="h-6 w-6 shrink-0 pointer-events-auto rounded-full border border-neutral-400 bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.55)] flex items-center justify-center text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                @
              </button>
            )}
          </div>
          <div className="shrink-0 px-2 pointer-events-auto">
            <ReadUnreadButton
              showUnread={state.showUnread || mutedUnreadActive}
              tone={mutedUnreadActive && !state.showUnread ? 'slate' : 'red'}
              onMarkRead={() => state.markAsRead.mutate()}
              onMarkUnread={() => state.markAsUnread.mutate()}
              isMarkReadPending={state.markAsRead.isPending}
              isMarkUnreadPending={state.markAsUnread.isPending}
            />
          </div>
          <div className="flex-1" aria-hidden />
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
          sendBlockedReason={sendBlockedReason}
          statusPending={{
            ...statusPending,
            currentStatusId: currentThread?.status_id ?? null,
          }}
        />

        {/* Окно поиска+фильтров — оверлей поверх области чата. Лента под ним
            остаётся живой, поэтому «перейти к сообщению» скроллит её. */}
        {searchOverlayOpen && (
          <ThreadSearchOverlay
            threadId={threadId}
            threadName={currentThread?.name}
            onClose={() => setSearchOverlayOpen(false)}
            onJump={handleJumpToMessage}
          />
        )}
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

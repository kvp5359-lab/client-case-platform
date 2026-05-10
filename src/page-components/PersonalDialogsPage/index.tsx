/**
 * Страница «Личные диалоги».
 *
 * Показывает треды, у которых `owner_user_id = текущий юзер` (для сотрудника)
 * или выбранный юзер (для владельца воркспейса). Объединяет все каналы личных
 * диалогов: Telegram Business, Telegram MTProto, Wazzup (WhatsApp), Email.
 *
 * Этап 2 рефакторинга «Личные диалоги без проекта».
 */

"use client"

import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { MessageSquare, Search, X, FolderInput, Users } from 'lucide-react'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'
import { InboxChatItem } from '@/components/messenger/InboxChatItem'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ContactCardDialog } from '@/components/contacts/ContactCardDialog'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { useAuth } from '@/contexts/AuthContext'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { usePageTitle } from '@/hooks/usePageTitle'
import { usePersonalDialogs } from '@/hooks/messenger/usePersonalDialogs'
import { useMoveThreadToProject } from '@/hooks/messenger/useMoveThreadToProject'
import { useAccessibleProjects } from '@/hooks/shared/useAccessibleProjects'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useWorkspacePermissions } from '@/hooks/permissions/useWorkspacePermissions'
import { cn } from '@/lib/utils'
import type { PersonalDialogChannel, PersonalDialogEntry } from '@/services/api/personalDialogsService'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { MessageChannel } from '@/services/api/messenger/messengerService'
import type { MessengerAccent } from '@/components/messenger/utils/messageStyles'

type ChannelFilter = 'all' | PersonalDialogChannel

const CHANNEL_LABELS: Record<PersonalDialogChannel, string> = {
  telegram_business: 'Telegram',
  telegram_mtproto: 'Telegram',
  wazzup: 'WhatsApp',
  email: 'Email',
  other: 'Другие',
}

/** Адаптер PersonalDialogEntry → InboxThreadEntry для переиспользования InboxChatItem. */
function toInboxEntry(d: PersonalDialogEntry): InboxThreadEntry {
  const channelType: 'web' | 'telegram' | 'email' =
    d.channel === 'email'
      ? 'email'
      : d.channel === 'telegram_business' || d.channel === 'telegram_mtproto'
        ? 'telegram'
        : 'web'
  return {
    thread_id: d.thread_id,
    thread_name: d.thread_name,
    thread_icon: d.thread_icon,
    thread_accent_color: d.thread_accent_color,
    thread_type: d.thread_type === 'task' ? 'task' : 'chat',
    project_id: d.project_id,
    project_name: d.project_name,
    channel_type: channelType,
    legacy_channel: d.legacy_channel,
    last_message_at: d.last_message_at,
    last_message_text: d.last_message_text,
    last_message_attachment_name: d.last_message_attachment_name,
    last_message_attachment_count: d.last_message_attachment_count,
    last_sender_name: d.last_sender_name,
    last_sender_avatar_url: d.last_sender_avatar_url,
    unread_count: d.unread_count,
    manually_unread: d.manually_unread,
    has_unread_reaction: false,
    unread_reaction_count: 0,
    last_reaction_emoji: null,
    last_reaction_at: null,
    last_reaction_sender_name: null,
    last_reaction_sender_avatar_url: null,
    last_reaction_message_preview: null,
    contact_email: d.email_contact,
    email_subject: d.email_subject,
    last_event_at: null,
    last_event_text: null,
    last_event_status_color: null,
    unread_event_count: 0,
    // PersonalDialogEntry не несёт «собеседника» отдельно — у личных диалогов
    // он совпадает с last_sender (внешний контакт), InboxChatItem умеет
    // fallback на last_sender_name/avatar когда counterpart_* пустые.
    counterpart_name: null,
    counterpart_avatar_url: null,
  }
}

export default function PersonalDialogsPage() {
  usePageTitle('Личные диалоги')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { user } = useAuth()
  const closePanel = useSidePanelStore((s) => s.closePanel)

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [targetUserOverride, setTargetUserOverride] = useState<string | null>(null)
  const [bindOpen, setBindOpen] = useState(false)
  const [contactCardOpen, setContactCardOpen] = useState(false)

  const permsResult = useWorkspacePermissions({ workspaceId })
  const canViewAll = permsResult.isOwner || permsResult.can('view_all_projects')

  // Целевой юзер: владелец может смотреть чужие диалоги через override.
  const targetUserId = canViewAll ? (targetUserOverride ?? user?.id) : user?.id

  useEffect(() => {
    closePanel()
  }, [closePanel])

  const { data: dialogs = [], isLoading } = usePersonalDialogs(workspaceId, targetUserId)
  const { data: participants = [] } = useWorkspaceParticipants(canViewAll ? workspaceId : undefined)
  const { data: accessibleProjects = [] } = useAccessibleProjects(workspaceId)
  const moveMutation = useMoveThreadToProject(workspaceId)

  const visibleDialogs = useMemo(() => {
    let result = dialogs
    if (channelFilter !== 'all') {
      result = result.filter((d) => d.channel === channelFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        (d) =>
          d.thread_name.toLowerCase().includes(q) ||
          (d.last_message_text ?? '').toLowerCase().includes(q),
      )
    }
    return result
  }, [dialogs, channelFilter, searchQuery])

  const channelCounts = useMemo(() => {
    const acc: Record<ChannelFilter, number> = {
      all: dialogs.length,
      telegram_business: 0,
      telegram_mtproto: 0,
      wazzup: 0,
      email: 0,
      other: 0,
    }
    for (const d of dialogs) acc[d.channel]++
    return acc
  }, [dialogs])

  const activeChat = useMemo(() => {
    if (selectedThreadId) return dialogs.find((d) => d.thread_id === selectedThreadId) ?? null
    return visibleDialogs.length > 0 ? visibleDialogs[0] : null
  }, [selectedThreadId, dialogs, visibleDialogs])

  return (
    <WorkspaceLayout>
      <div className="h-full overflow-hidden bg-white p-6 pr-[72px]">
        <div className="flex h-full overflow-hidden max-w-7xl mx-auto rounded-lg border bg-white">
          {/* Левая панель — список */}
          <div className="w-[35%] min-w-[260px] max-w-[380px] flex flex-col border-r overflow-hidden">
            <div className="px-4 py-3 border-b shrink-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="font-semibold text-sm">Личные диалоги</h2>
                <div className="flex items-center gap-1">
                  {canViewAll && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex items-center gap-1"
                          title={
                            targetUserOverride
                              ? `Смотрим: ${
                                  participants.find((p) => p.user_id === targetUserOverride)?.name ?? 'другой сотрудник'
                                }`
                              : 'Мои диалоги'
                          }
                        >
                          <Users className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64 p-1">
                        <button
                          type="button"
                          onClick={() => {
                            setTargetUserOverride(null)
                            setSelectedThreadId(null)
                          }}
                          className={cn(
                            'w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100',
                            !targetUserOverride && 'bg-blue-50 text-blue-700',
                          )}
                        >
                          Мои диалоги
                        </button>
                        <div className="my-1 border-t" />
                        <div className="max-h-64 overflow-y-auto">
                          {participants
                            .filter((p) => p.user_id && p.user_id !== user?.id && p.can_login)
                            .map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setTargetUserOverride(p.user_id)
                                  setSelectedThreadId(null)
                                }}
                                className={cn(
                                  'w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100',
                                  targetUserOverride === p.user_id && 'bg-blue-50 text-blue-700',
                                )}
                              >
                                {[p.name, p.last_name].filter(Boolean).join(' ')}
                              </button>
                            ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (searchOpen) {
                        setSearchOpen(false)
                        setSearchQuery('')
                      } else {
                        setSearchOpen(true)
                      }
                    }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  >
                    {searchOpen ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {searchOpen ? (
                <input
                  type="text"
                  placeholder="Поиск по диалогу или сообщению..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-sm py-1 bg-transparent focus:outline-none border-b border-gray-200 focus:border-blue-400"
                  autoFocus
                />
              ) : (
                <div className="flex items-center gap-1 flex-wrap">
                  <ChannelChip
                    active={channelFilter === 'all'}
                    label="Все"
                    count={channelCounts.all}
                    onClick={() => setChannelFilter('all')}
                  />
                  {channelCounts.telegram_business > 0 && (
                    <ChannelChip
                      active={channelFilter === 'telegram_business'}
                      label={CHANNEL_LABELS.telegram_business}
                      count={channelCounts.telegram_business}
                      onClick={() => setChannelFilter('telegram_business')}
                    />
                  )}
                  {channelCounts.telegram_mtproto > 0 && (
                    <ChannelChip
                      active={channelFilter === 'telegram_mtproto'}
                      label={CHANNEL_LABELS.telegram_mtproto + ' (личный)'}
                      count={channelCounts.telegram_mtproto}
                      onClick={() => setChannelFilter('telegram_mtproto')}
                    />
                  )}
                  {channelCounts.wazzup > 0 && (
                    <ChannelChip
                      active={channelFilter === 'wazzup'}
                      label={CHANNEL_LABELS.wazzup}
                      count={channelCounts.wazzup}
                      onClick={() => setChannelFilter('wazzup')}
                    />
                  )}
                  {channelCounts.email > 0 && (
                    <ChannelChip
                      active={channelFilter === 'email'}
                      label={CHANNEL_LABELS.email}
                      count={channelCounts.email}
                      onClick={() => setChannelFilter('email')}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {isLoading ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Загрузка...
                </div>
              ) : visibleDialogs.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {searchQuery
                    ? 'Ничего не найдено'
                    : channelFilter !== 'all'
                      ? 'Нет диалогов в этом канале'
                      : 'Личных диалогов пока нет'}
                </div>
              ) : (
                visibleDialogs.map((d) => (
                  <InboxChatItem
                    key={d.thread_id}
                    chat={toInboxEntry(d)}
                    isSelected={activeChat?.thread_id === d.thread_id}
                    onClick={() => {
                      setSelectedThreadId(d.thread_id)
                      // Открываем в глобальной side-панели — шапка покажет контакт
                      // вместо проекта, вкладки сгруппируются по контакту.
                      globalOpenThread({
                        id: d.thread_id,
                        name: d.thread_name,
                        type: d.thread_type === 'task' ? 'task' : 'chat',
                        project_id: d.project_id,
                        workspace_id: workspaceId ?? '',
                        status_id: null,
                        deadline: null,
                        accent_color: d.thread_accent_color,
                        icon: d.thread_icon,
                        is_pinned: false,
                        created_at: '',
                        sort_order: 0,
                        contact_participant_id: d.contact_participant_id,
                      })
                    }}
                    hideProjectName
                  />
                ))
              )}
            </div>
          </div>

          {/* Правая панель */}
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
            {activeChat && workspaceId ? (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => activeChat.contact_participant_id && setContactCardOpen(true)}
                    disabled={!activeChat.contact_participant_id}
                    className="flex items-center gap-2 min-w-0 text-sm font-medium hover:text-blue-600 disabled:hover:text-current disabled:cursor-default"
                    title={activeChat.contact_participant_id ? 'Открыть карточку контакта' : 'Контакт не определён'}
                  >
                    <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500 shrink-0">
                      {activeChat.thread_name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="truncate">{activeChat.thread_name}</span>
                  </button>
                  <Popover open={bindOpen} onOpenChange={setBindOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-1 text-gray-600"
                      >
                        <FolderInput className="h-3.5 w-3.5" />
                        Привязать к проекту
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-1">
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        Перенести этот диалог в проект:
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        {accessibleProjects.length === 0 ? (
                          <div className="px-2 py-2 text-sm text-muted-foreground">Проекты не найдены</div>
                        ) : (
                          accessibleProjects.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              disabled={moveMutation.isPending}
                              onClick={() => {
                                moveMutation.mutate(
                                  { threadId: activeChat.thread_id, targetProjectId: p.id },
                                  {
                                    onSuccess: () => {
                                      setBindOpen(false)
                                      setSelectedThreadId(null)
                                    },
                                  },
                                )
                              }}
                              className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100 disabled:opacity-50"
                            >
                              {p.name}
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex-1 min-h-0">
                  <MessengerTabContent
                    key={activeChat.thread_id}
                    projectId={activeChat.project_id ?? undefined}
                    workspaceId={workspaceId}
                    channel={(activeChat.legacy_channel as MessageChannel) ?? 'client'}
                    threadId={activeChat.thread_id}
                    accent={(activeChat.thread_accent_color as MessengerAccent) ?? 'blue'}
                  />
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                <MessageSquare className="h-12 w-12 opacity-20" />
                <p className="text-sm">Выберите диалог</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <ContactCardDialog
        participantId={activeChat?.contact_participant_id ?? null}
        open={contactCardOpen}
        onOpenChange={setContactCardOpen}
        onOpenThread={(tid) => setSelectedThreadId(tid)}
      />
    </WorkspaceLayout>
  )
}

interface ChannelChipProps {
  active: boolean
  label: string
  count: number
  onClick: () => void
}

function ChannelChip({ active, label, count, onClick }: ChannelChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1',
        active
          ? 'bg-blue-100 text-blue-700 font-medium'
          : 'text-gray-500 hover:bg-gray-100',
      )}
    >
      {label}
      <span
        className={cn(
          'min-w-[16px] h-4 px-1 rounded-full text-[10px] font-medium flex items-center justify-center',
          active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600',
        )}
      >
        {count}
      </span>
    </button>
  )
}

"use client"

/**
 * Вкладка «История» проекта — sidebar (каналы) + контент (лента / мессенджер / аудит)
 *
 * Режимы:
 * - «Вся история» — timeline: аудит + сообщения из всех чатов вперемешку (с настоящим MessageBubble)
 * - Конкретный чат — полноценный MessengerTabContent
 * - Категория ресурса — аудит-лента с фильтром по resource_type
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Loader2,
  History,
  FileText,
  Folder,
  FolderOpen,
  Users,
  CheckSquare,
  ClipboardEdit,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { TimelineFeed } from './TimelineFeed'
import { ActivityFeed } from './ActivityFeed'
import { useProjectHistory, useMarkHistoryAsRead } from '@/hooks/useProjectHistory'
import { useTimelineMessages } from '@/hooks/useTimelineMessages'
import { useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { useAuth } from '@/contexts/AuthContext'
import { useInboxThreadsV2 } from '@/hooks/messenger/useInbox'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'
import { InboxChatItem } from '@/page-components/InboxPage/InboxChatItem'
import type { AuditLogEntry } from '@/types/history'

interface HistoryTabContentProps {
  projectId: string
  workspaceId: string
}

type SidebarItem =
  | { kind: 'all' }
  | { kind: 'thread'; thread: ProjectThread }
  | { kind: 'resource'; value: string; label: string }

const RESOURCE_ITEMS: { value: string; label: string; icon: typeof FileText }[] = [
  { value: 'document', label: 'Документы', icon: FileText },
  { value: 'document_kit', label: 'Наборы документов', icon: FolderOpen },
  { value: 'folder', label: 'Папки', icon: Folder },
  { value: 'project_participant', label: 'Участники', icon: Users },
  { value: 'task', label: 'Задачи', icon: CheckSquare },
  { value: 'form_kit', label: 'Анкеты', icon: ClipboardEdit },
]

export function HistoryTabContent({ projectId, workspaceId }: HistoryTabContentProps) {
  const { user } = useAuth()
  const [selected, setSelected] = useState<SidebarItem>({ kind: 'all' })

  const markAsRead = useMarkHistoryAsRead(projectId)
  const [lastReadAt, setLastReadAt] = useState<string | undefined>()
  useEffect(() => {
    setLastReadAt(new Date().toISOString())
    markAsRead.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const { data: threads = [] } = useProjectThreads(projectId)

  // Inbox data for rich chat list (avatars, last message, badges)
  const { data: inboxChats = [] } = useInboxThreadsV2(workspaceId)
  const projectInboxChats = useMemo(
    () => inboxChats.filter((c) => c.project_id === projectId && c.last_message_at),
    [inboxChats, projectId],
  )

  // Determine what to render in content area
  const selectedResource = selected.kind === 'resource' ? selected.value : undefined

  const handleOpenChat = useCallback(
    (threadId: string) => {
      const thread = threads.find((t) => t.id === threadId)
      if (thread) setSelected({ kind: 'thread', thread })
    },
    [threads],
  )

  return (
    <div
      className="rounded-lg border bg-white flex overflow-hidden"
      style={{ height: 'calc(100vh - 145px)' }}
    >
      {/* Sidebar — Inbox style */}
      <div className="w-[35%] min-w-[220px] max-w-[352px] flex flex-col border-r overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {/* Вся история */}
          <div className="pt-4" />
          <SidebarButton
            active={selected.kind === 'all'}
            onClick={() => setSelected({ kind: 'all' })}
            icon={<History className="w-4 h-4 text-gray-500" />}
            label="Вся история"
          />

          {/* Чаты — InboxChatItem из Входящих */}
          {projectInboxChats.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1.5">
                <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                  Чаты
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {projectInboxChats.map((chat) => {
                  const thread = threads.find((t) => t.id === chat.thread_id)
                  return (
                    <InboxChatItem
                      key={chat.thread_id}
                      chat={chat}
                      isSelected={
                        selected.kind === 'thread' && selected.thread.id === chat.thread_id
                      }
                      onClick={() => {
                        if (thread) setSelected({ kind: 'thread', thread })
                      }}
                      hideProjectName
                    />
                  )
                })}
              </div>
            </>
          )}

          {/* Ресурсы */}
          <div className="px-4 pt-3 pb-1.5">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
              Ресурсы
            </span>
          </div>
          {RESOURCE_ITEMS.map((item) => (
            <SidebarButton
              key={item.value}
              active={selected.kind === 'resource' && selected.value === item.value}
              onClick={() =>
                setSelected({ kind: 'resource', value: item.value, label: item.label })
              }
              icon={<item.icon className="w-4 h-4 text-gray-500" />}
              label={item.label}
            />
          ))}
          <div className="pb-4" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r">
        {selected.kind === 'all' && (
          <AllHistoryContent
            projectId={projectId}
            threads={threads}
            currentUserId={user?.id}
            lastReadAt={lastReadAt}
            onOpenChat={handleOpenChat}
          />
        )}
        {selected.kind === 'thread' && (
          <div className="flex-1 min-h-0">
            <MessengerTabContent
              key={selected.thread.id}
              projectId={projectId}
              workspaceId={workspaceId}
              channel={(selected.thread.legacy_channel as 'client' | 'internal') ?? 'client'}
              threadId={selected.thread.id}
              accent={selected.thread.accent_color ?? 'blue'}
            />
          </div>
        )}
        {selected.kind === 'resource' && (
          <ResourceHistoryContent
            projectId={projectId}
            resourceType={selectedResource!}
            lastReadAt={lastReadAt}
          />
        )}
      </div>
    </div>
  )
}

/** Sidebar button — Inbox style */
function SidebarButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        active ? 'bg-blue-100 font-medium' : 'hover:bg-gray-50',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className={cn('text-sm truncate flex-1', active && 'font-medium')}>{label}</span>
      {!!badge && badge > 0 && (
        <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-blue-500 text-white text-[11px] font-medium flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

/** «Вся история» — timeline: аудит + сообщения из всех тредов */
function AllHistoryContent({
  projectId,
  threads,
  currentUserId,
  lastReadAt,
  onOpenChat,
}: {
  projectId: string
  threads: ProjectThread[]
  currentUserId?: string
  lastReadAt?: string
  onOpenChat: (threadId: string) => void
}) {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useProjectHistory(
    projectId,
    {},
  )

  const allAuditEntries = useMemo(
    () => (data?.pages.flatMap((page) => page) ?? []) as AuditLogEntry[],
    [data],
  )

  const visibleThreads = useMemo(() => threads.filter((t) => !t.is_deleted), [threads])
  const allThreadIds = useMemo(() => visibleThreads.map((t) => t.id), [visibleThreads])
  const { data: timelineMessages = [] } = useTimelineMessages(projectId, allThreadIds, threads)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 flex-1">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Кнопка подгрузки старых событий — сверху */}
        {hasNextPage && (
          <div className="flex justify-center py-3 border-b">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Загрузка...
                </>
              ) : (
                'Загрузить ранее'
              )}
            </Button>
          </div>
        )}
        <TimelineFeed
          auditEntries={allAuditEntries}
          messages={timelineMessages}
          currentUserId={currentUserId}
          lastReadAt={lastReadAt}
          onOpenChat={onOpenChat}
        />
      </div>
    </div>
  )
}

/** Лента аудита для одного типа ресурса */
function ResourceHistoryContent({
  projectId,
  resourceType,
  lastReadAt,
}: {
  projectId: string
  resourceType: string
  lastReadAt?: string
}) {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useProjectHistory(
    projectId,
    { resourceTypes: [resourceType] },
  )

  const entries = useMemo(
    () => (data?.pages.flatMap((page) => page) ?? []) as AuditLogEntry[],
    [data],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 flex-1">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {hasNextPage && (
          <div className="flex justify-center py-3 border-b">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Загрузка...
                </>
              ) : (
                'Загрузить ранее'
              )}
            </Button>
          </div>
        )}
        <ActivityFeed entries={entries} lastReadAt={lastReadAt} />
      </div>
    </div>
  )
}

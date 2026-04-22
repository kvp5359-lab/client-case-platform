"use client"

/**
 * «Вся история» — timeline: аудит + сообщения из всех тредов проекта вперемешку.
 * Раньше жил внутри HistoryTabContent, вынесен отдельно для переиспользования
 * в TaskPanel (боковая панель треда).
 */

import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TimelineFeed } from './TimelineFeed'
import { useProjectHistory } from '@/hooks/useProjectHistory'
import { useTimelineMessages } from '@/hooks/useTimelineMessages'
import { useTaskStatuses } from '@/hooks/useStatuses'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { AuditLogEntry } from '@/types/history'

interface AllHistoryContentProps {
  projectId: string
  workspaceId?: string
  threads: ProjectThread[]
  currentUserId?: string
  lastReadAt?: string
  /** last_read_at по каждому треду — для красной рамки непрочитанных сообщений. */
  threadLastReadAt?: Map<string, string>
  onOpenChat: (threadId: string) => void
}

export function AllHistoryContent({
  projectId,
  workspaceId,
  threads,
  currentUserId,
  lastReadAt,
  threadLastReadAt,
  onOpenChat,
}: AllHistoryContentProps) {
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)
  const statusMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }>()
    for (const s of taskStatuses) map.set(s.id, { name: s.name, color: s.color ?? null })
    return map
  }, [taskStatuses])
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
      <div className="flex-1 overflow-y-auto" style={{ overflowAnchor: 'none' }}>
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
          threadLastReadAt={threadLastReadAt}
          statusMap={statusMap}
          onOpenChat={onOpenChat}
        />
      </div>
    </div>
  )
}

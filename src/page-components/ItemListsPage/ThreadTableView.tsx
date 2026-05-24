"use client"

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceThreads, type WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import { useTaskAssigneesMap } from '@/components/tasks/useTaskAssignees'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useFilteredTasks } from '@/components/boards/hooks/useFilteredListData'
import type { FilterContext, FilterGroup } from '@/lib/filters/types'
import { TableShell, type TableShellColumn } from './TableShell'
import { ThreadRow } from './ThreadRow'
import { BulkActionsBar } from './BulkActionsBar'

export type ThreadTableViewProps = {
  workspaceId: string
  currentUserId: string
  filters: FilterGroup
  sortBy: string | null
  sortDir: 'asc' | 'desc' | null
  columns: TableShellColumn[]
  selectedIds: Set<string>
  onSelectedChange: (next: Set<string>) => void
  onResizeCommit: (key: string, width: number) => void
}

export function ThreadTableView({
  workspaceId,
  currentUserId,
  filters,
  sortBy,
  sortDir,
  columns,
  selectedIds,
  onSelectedChange,
  onResizeCommit,
}: ThreadTableViewProps) {
  const { data: threads = [], isLoading } = useWorkspaceThreads(workspaceId)
  const taskIds = useMemo(() => threads.map((t) => t.id), [threads])
  const { data: assigneesMap = {} } = useTaskAssigneesMap(taskIds)
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)

  const ctx = useMemo<FilterContext>(
    () => ({
      currentParticipantId: null,
      currentUserId,
      now: new Date(),
    }),
    [currentUserId],
  )

  const filtered = useFilteredTasks(
    threads,
    filters,
    ctx,
    assigneesMap,
    (sortBy as never) ?? 'created_at',
    sortDir ?? 'desc',
  )

  const router = useRouter()

  return (
    <TableShell
      isLoading={isLoading}
      isEmpty={filtered.length === 0}
      total={filtered.length}
      columns={columns}
      selectedIds={selectedIds}
      allItemIds={filtered.map((t) => t.id)}
      onSelectedChange={onSelectedChange}
      onResizeCommit={onResizeCommit}
      bulkActions={
        <BulkActionsBar
          entityType="thread"
          selectedIds={selectedIds}
          onClearSelection={() => onSelectedChange(new Set())}
          workspaceId={workspaceId}
          items={filtered}
          taskStatuses={taskStatuses}
        />
      }
      renderRow={(task: WorkspaceTask) => (
        <ThreadRow
          key={task.id}
          task={task}
          columns={columns}
          checked={selectedIds.has(task.id)}
          onToggle={() => {
            const next = new Set(selectedIds)
            if (next.has(task.id)) next.delete(task.id)
            else next.add(task.id)
            onSelectedChange(next)
          }}
          onOpen={() => {
            if (task.project_id) {
              router.push(`/workspaces/${workspaceId}/projects/${task.project_id}?thread=${task.id}`)
            }
          }}
          assigneesMap={assigneesMap}
          taskStatuses={taskStatuses}
        />
      )}
      items={filtered}
    />
  )
}

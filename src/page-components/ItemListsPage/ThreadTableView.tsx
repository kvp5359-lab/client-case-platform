"use client"

import { useMemo, useRef, useCallback, useEffect } from 'react'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import { useListThreads } from './useListData'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import { useTaskAssigneesMap } from '@/components/tasks/useTaskAssignees'
import { useThreadCounterpartNameMap } from '@/hooks/messenger/useThreadCounterpartName'
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
  // Серверная фильтрация (Фаза 1): тянем только подходящие под фильтр треды,
  // не весь воркспейс. Клиентский useFilteredTasks ниже дорезает точно + сортирует.
  const { data: threads = [], isLoading } = useListThreads(workspaceId, filters)
  const taskIds = useMemo(() => threads.map((t) => t.id), [threads])
  const { data: assigneesMap = {} } = useTaskAssigneesMap(taskIds)
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)
  // P4b: одна подписка на inbox-кэш + карта на уровне таблицы (значение пропом
  // в строки), вместо подписки в каждой из ~1000 строк.
  const counterpartNameMap = useThreadCounterpartNameMap(workspaceId)

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

  const layoutPanel = useLayoutTaskPanel()

  // Стабильные колбэки строк: держим актуальный selectedIds в ref, чтобы
  // handleToggle не пересоздавался при каждом выделении → memo(ThreadRow)
  // перерисовывает только реально изменившиеся строки, а не все ~1000.
  const selectedRef = useRef(selectedIds)
  useEffect(() => {
    selectedRef.current = selectedIds
  }, [selectedIds])
  const handleToggle = useCallback(
    (id: string) => {
      const next = new Set(selectedRef.current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onSelectedChange(next)
    },
    [onSelectedChange],
  )
  const handleOpen = useCallback(
    (task: WorkspaceTask) => {
      layoutPanel?.openThread({
        id: task.id,
        name: task.name,
        type: task.type ?? 'task',
        project_id: task.project_id,
        workspace_id: task.workspace_id,
        status_id: task.status_id,
        deadline: task.deadline,
        start_at: task.start_at,
        end_at: task.end_at,
        accent_color: task.accent_color,
        icon: task.icon,
        is_pinned: task.is_pinned,
        created_at: task.created_at,
        created_by: task.created_by,
        sort_order: task.sort_order,
        project_name: task.project_name,
      })
    },
    [layoutPanel],
  )

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
      renderRow={(task: WorkspaceTask, meta) => (
        <ThreadRow
          key={task.id}
          task={task}
          columns={columns}
          checked={selectedIds.has(task.id)}
          onToggle={handleToggle}
          onOpen={handleOpen}
          assigneesMap={assigneesMap}
          taskStatuses={taskStatuses}
          counterpartName={counterpartNameMap.get(task.id) ?? null}
          measureRef={meta.measureRef}
          dataIndex={meta.dataIndex}
        />
      )}
      items={filtered}
    />
  )
}

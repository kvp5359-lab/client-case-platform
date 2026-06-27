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
import { useQuickFilters, type QuickFilterColumn } from './useQuickFilters'

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
  // Серверная фильтрация + пагинация (Вариант A): сервер фильтрует, сортирует и
  // отдаёт страницами по скроллу. Клиентский useFilteredTasks ниже дорезает
  // каждую загруженную страницу точно, сохраняя серверный порядок.
  const {
    rows: threads,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useListThreads(workspaceId, filters, sortBy, sortDir ?? 'desc')
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
    // sortBy в БД — свободная строка; applyFilters ждёт узкий SortField — каст
    (sortBy as never) ?? 'created_at',
    sortDir ?? 'desc',
  )

  // Быстрый фильтр по заголовкам (значения только из текущего списка).
  const quickConfig = useMemo<QuickFilterColumn<WorkspaceTask>[]>(
    () => [
      {
        key: 'status',
        getValues: (t) => [{
          value: t.status_id ?? '__none__',
          label: t.status_id ? (taskStatuses.find((s) => s.id === t.status_id)?.name ?? '—') : 'Без статуса',
        }],
      },
      {
        key: 'project',
        getValues: (t) => {
          const v = t.project_name ?? counterpartNameMap.get(t.id) ?? '__none__'
          return [{ value: v, label: v === '__none__' ? 'Без проекта' : v }]
        },
      },
      {
        key: 'type',
        getValues: (t) => {
          const v = t.type ?? 'task'
          return [{ value: v, label: v === 'task' ? 'Задача' : 'Чат' }]
        },
      },
      {
        key: 'assignees',
        getValues: (t) => {
          const a = assigneesMap[t.id] ?? []
          if (a.length === 0) return [{ value: '__none__', label: 'Без исполнителя' }]
          return a.map((x) => ({ value: x.id, label: `${x.name}${x.last_name ? ` ${x.last_name}` : ''}` }))
        },
      },
    ],
    [taskStatuses, counterpartNameMap, assigneesMap],
  )
  const { apply: applyQuick, columnFilter } = useQuickFilters(filtered, quickConfig)
  const displayed = useMemo(() => applyQuick(filtered), [applyQuick, filtered])

  const layoutPanel = useLayoutTaskPanel()

  // Стабильные колбэки строк: держим актуальный selectedIds в ref, чтобы
  // handleToggle не пересоздавался при каждом выделении → memo(ThreadRow)
  // перерисовывает только реально изменившиеся строки, а не все ~1000.
  const selectedRef = useRef(selectedIds)
  useEffect(() => {
    selectedRef.current = selectedIds
  }, [selectedIds])
  // Для shift-диапазона: актуальный список отображаемых строк + якорь (индекс
  // последнего обычного клика). В ref'ах, чтобы handleToggle оставался стабильным
  // (иначе memo(ThreadRow) перерисует все строки).
  const displayedRef = useRef(displayed)
  useEffect(() => {
    displayedRef.current = displayed
  }, [displayed])
  const anchorRef = useRef<number | null>(null)
  const handleToggle = useCallback(
    (id: string, index: number, shift: boolean) => {
      const next = new Set(selectedRef.current)
      if (shift && anchorRef.current != null) {
        const arr = displayedRef.current
        const a = anchorRef.current
        const [lo, hi] = a < index ? [a, index] : [index, a]
        for (let i = lo; i <= hi; i++) {
          const item = arr[i]
          if (item) next.add(item.id)
        }
        onSelectedChange(next)
        return
      }
      if (next.has(id)) next.delete(id)
      else next.add(id)
      anchorRef.current = index
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
      isEmpty={displayed.length === 0}
      total={displayed.length}
      columns={columns}
      selectedIds={selectedIds}
      allItemIds={displayed.map((t) => t.id)}
      onSelectedChange={onSelectedChange}
      onResizeCommit={onResizeCommit}
      onActivateRow={handleOpen}
      columnFilter={columnFilter}
      onEndReached={() => { if (hasNextPage) fetchNextPage() }}
      isFetchingMore={isFetchingNextPage}
      bulkActions={
        <BulkActionsBar
          entityType="thread"
          selectedIds={selectedIds}
          onClearSelection={() => onSelectedChange(new Set())}
          workspaceId={workspaceId}
          items={displayed}
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
          focused={meta.focused}
        />
      )}
      items={displayed}
    />
  )
}

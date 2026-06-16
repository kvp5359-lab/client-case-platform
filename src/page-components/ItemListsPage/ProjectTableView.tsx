"use client"

import { useMemo, useRef, useEffect, useCallback } from 'react'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import { useListProjects } from './useListData'
import { useAllProjectStatuses } from '@/hooks/useStatuses'
import { useFilteredProjects } from '@/components/boards/hooks/useFilteredListData'
import type { FilterContext, FilterGroup } from '@/lib/filters/types'
import type { BoardProject } from '@/components/boards/hooks/useWorkspaceProjects'
import { TableShell, type TableShellColumn } from './TableShell'
import { ProjectRow } from './ProjectRow'
import { BulkActionsBar } from './BulkActionsBar'
import { useQuickFilters, type QuickFilterColumn } from './useQuickFilters'

export type ProjectTableViewProps = {
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

export function ProjectTableView({
  workspaceId,
  currentUserId,
  filters,
  sortBy,
  sortDir,
  columns,
  selectedIds,
  onSelectedChange,
  onResizeCommit,
}: ProjectTableViewProps) {
  // Серверная фильтрация + пагинация (Вариант A): подходящие проекты страницами
  // по скроллу. useFilteredProjects ниже дорезает точно, сохраняя порядок.
  const {
    rows: projects,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useListProjects(workspaceId, filters, sortBy, sortDir ?? 'desc')
  const { data: projectStatuses = [] } = useAllProjectStatuses(workspaceId)

  const ctx = useMemo<FilterContext>(
    () => ({
      currentParticipantId: null,
      currentUserId,
      now: new Date(),
    }),
    [currentUserId],
  )

  // participantsMap для junction-фильтра — пустая map в MVP (см. infrastructure.md).
  const participantsMap = useMemo<Record<string, { id: string }[]>>(() => ({}), [])

  const filtered = useFilteredProjects(
    projects as unknown as Array<Record<string, unknown> & { id: string }>,
    filters,
    ctx,
    participantsMap,
    (sortBy as never) ?? 'created_at',
    sortDir ?? 'desc',
  ) as unknown as BoardProject[]

  // Быстрый фильтр по заголовкам (значения только из текущего списка).
  const quickConfig = useMemo<QuickFilterColumn<BoardProject>[]>(
    () => [
      {
        key: 'status',
        getValues: (p) => [{
          value: p.status_id ?? '__none__',
          label: p.status_id ? (projectStatuses.find((s) => s.id === p.status_id)?.name ?? '—') : 'Без статуса',
        }],
      },
      {
        key: 'template',
        getValues: (p) => {
          const v = p.template_name ?? '__none__'
          return [{ value: v, label: v === '__none__' ? 'Без шаблона' : v }]
        },
      },
    ],
    [projectStatuses],
  )
  const { apply: applyQuick, columnFilter } = useQuickFilters(filtered, quickConfig)
  const displayed = useMemo(() => applyQuick(filtered), [applyQuick, filtered])

  // Shift-диапазон выделения: якорь + актуальный список в ref'ах.
  const displayedRef = useRef(displayed)
  useEffect(() => { displayedRef.current = displayed }, [displayed])
  const selectedRef = useRef(selectedIds)
  useEffect(() => { selectedRef.current = selectedIds }, [selectedIds])
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

  const layoutPanel = useLayoutTaskPanel()

  const handleOpen = (project: BoardProject) =>
    layoutPanel?.openProject?.({
      id: project.id,
      name: project.name,
      created_at: project.created_at,
      description: project.description,
    })

  return (
    <TableShell
      isLoading={isLoading}
      isEmpty={displayed.length === 0}
      total={displayed.length}
      columns={columns}
      selectedIds={selectedIds}
      allItemIds={displayed.map((p) => p.id)}
      onSelectedChange={onSelectedChange}
      onResizeCommit={onResizeCommit}
      onActivateRow={handleOpen}
      columnFilter={columnFilter}
      onEndReached={() => { if (hasNextPage) fetchNextPage() }}
      isFetchingMore={isFetchingNextPage}
      bulkActions={
        <BulkActionsBar
          entityType="project"
          selectedIds={selectedIds}
          onClearSelection={() => onSelectedChange(new Set())}
          workspaceId={workspaceId}
          items={displayed}
          projectStatuses={projectStatuses}
        />
      }
      renderRow={(project, meta) => (
        <ProjectRow
          key={project.id}
          project={project}
          columns={columns}
          checked={selectedIds.has(project.id)}
          measureRef={meta.measureRef}
          dataIndex={meta.dataIndex}
          focused={meta.focused}
          onToggle={(shift) => handleToggle(project.id, meta.dataIndex ?? 0, shift)}
          onOpen={() => handleOpen(project)}
          projectStatuses={projectStatuses}
        />
      )}
      items={displayed}
    />
  )
}

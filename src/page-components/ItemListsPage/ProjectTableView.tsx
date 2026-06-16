"use client"

import { useMemo } from 'react'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import { useListProjects } from './useListData'
import { useAllProjectStatuses } from '@/hooks/useStatuses'
import { useFilteredProjects } from '@/components/boards/hooks/useFilteredListData'
import type { FilterContext, FilterGroup } from '@/lib/filters/types'
import type { BoardProject } from '@/components/boards/hooks/useWorkspaceProjects'
import { TableShell, type TableShellColumn } from './TableShell'
import { ProjectRow } from './ProjectRow'
import { BulkActionsBar } from './BulkActionsBar'

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
  // Серверная фильтрация (Фаза 1): только подходящие проекты + поля ближайшей
  // задачи (next_task_*). useFilteredProjects ниже дорезает точно + сортирует.
  const { data: projects = [], isLoading } = useListProjects(workspaceId, filters)
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

  const layoutPanel = useLayoutTaskPanel()

  return (
    <TableShell
      isLoading={isLoading}
      isEmpty={filtered.length === 0}
      total={filtered.length}
      columns={columns}
      selectedIds={selectedIds}
      allItemIds={filtered.map((p) => p.id)}
      onSelectedChange={onSelectedChange}
      onResizeCommit={onResizeCommit}
      bulkActions={
        <BulkActionsBar
          entityType="project"
          selectedIds={selectedIds}
          onClearSelection={() => onSelectedChange(new Set())}
          workspaceId={workspaceId}
          items={filtered}
          projectStatuses={projectStatuses}
        />
      }
      renderRow={(project) => (
        <ProjectRow
          key={project.id}
          project={project}
          columns={columns}
          checked={selectedIds.has(project.id)}
          onToggle={() => {
            const next = new Set(selectedIds)
            if (next.has(project.id)) next.delete(project.id)
            else next.add(project.id)
            onSelectedChange(next)
          }}
          onOpen={() =>
            layoutPanel?.openProject?.({
              id: project.id,
              name: project.name,
              created_at: project.created_at,
              description: project.description,
            })
          }
          projectStatuses={projectStatuses}
        />
      )}
      items={filtered}
    />
  )
}

"use client"

/**
 * TaskListControls — строка управления (пресет, поиск, группировка, создание)
 * и сворачиваемая панель фильтров для TaskListView.
 */

import { memo } from 'react'
import { Search, X, Plus, List, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { TaskStatus } from '@/hooks/useStatuses'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { useTaskFilters } from './useTaskFilters'

import { TaskPresetPopover } from './TaskPresetPopover'
import { AssigneeFilter, DeadlineFilter, StatusFilter, ProjectFilter } from './filters'

interface TaskListControlsProps {
  filters: ReturnType<typeof useTaskFilters>
  filtersOpen: boolean
  onToggleFilters: () => void
  presetPopoverOpen: boolean
  onPresetPopoverChange: (open: boolean) => void
  onCreateClick: () => void
  isProjectMode: boolean
  allAssignees: AvatarParticipant[]
  currentParticipantId: string | null
  taskStatuses: TaskStatus[]
}

export const TaskListControls = memo(function TaskListControls({
  filters,
  filtersOpen,
  onToggleFilters,
  presetPopoverOpen,
  onPresetPopoverChange,
  onCreateClick,
  isProjectMode,
  allAssignees,
  currentParticipantId,
  taskStatuses,
}: TaskListControlsProps) {
  return (
    <>
      {/* Строка: Кнопка фильтра (группа: попап + chevron) + Поиск + Создать */}
      <div className={cn('flex items-center gap-2', filtersOpen ? 'mb-1.5' : 'mb-4')}>
        <TaskPresetPopover
          preset={filters.preset}
          filtersModified={filters.filtersModified}
          filtersOpen={filtersOpen}
          presetPopoverOpen={presetPopoverOpen}
          onPresetPopoverChange={onPresetPopoverChange}
          onApplyPreset={filters.applyPreset}
          onToggleFilters={onToggleFilters}
        />
        <div className="flex-1 flex items-center gap-2 border rounded-md px-3 h-9 bg-background">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Поиск..."
            value={filters.searchQuery}
            onChange={(e) => filters.setSearchQuery(e.target.value)}
            className="text-sm bg-transparent focus:outline-none w-full"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => filters.setSearchQuery('')}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center border rounded-md h-9 shrink-0">
          <button
            type="button"
            onClick={() => filters.setGroupByDeadline(true)}
            className={cn(
              'h-full px-2 flex items-center transition-colors rounded-l-md',
              filters.groupByDeadline
                ? 'bg-brand-100 text-brand-600'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
            title="По срокам"
          >
            <CalendarDays className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => filters.setGroupByDeadline(false)}
            className={cn(
              'h-full px-2 flex items-center transition-colors rounded-r-md',
              !filters.groupByDeadline
                ? 'bg-brand-100 text-brand-600'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
            title="Без группировки"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9 shrink-0"
          onClick={onCreateClick}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Создать задачу
        </Button>
      </div>

      {/* Фильтры (отдельная строка, сворачиваемые) */}
      {filtersOpen && (
        <div className="flex items-center gap-1.5 mb-4">
          <AssigneeFilter
            allAssignees={allAssignees}
            selectedIds={filters.effectiveAssigneeFilter}
            onToggle={(id) => {
              const base = filters.assigneeFilterIds ?? filters.effectiveAssigneeFilter
              const next = new Set(base)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              filters.setAssigneeFilterIds(next)
              filters.markModified()
            }}
            onClear={() => {
              filters.setAssigneeFilterIds(new Set())
              filters.markModified()
            }}
            currentParticipantId={currentParticipantId}
          />
          <DeadlineFilter
            selectedValues={filters.effectiveDeadlineFilter}
            onToggle={(v) => {
              const base = filters.deadlineFilter ?? filters.effectiveDeadlineFilter
              const next = new Set(base)
              if (next.has(v)) next.delete(v)
              else next.add(v)
              filters.setDeadlineFilter(next)
              filters.markModified()
            }}
            onClear={() => {
              filters.setDeadlineFilter(new Set())
              filters.markModified()
            }}
          />
          <StatusFilter
            statuses={taskStatuses}
            selectedIds={filters.effectiveStatusFilter}
            onToggle={(id) => {
              const base = filters.statusFilterIds ?? filters.effectiveStatusFilter
              const next = new Set(base)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              filters.setStatusFilterIds(next)
              filters.markModified()
            }}
            onClear={() => {
              filters.setStatusFilterIds(new Set())
              filters.markModified()
            }}
          />
          {!isProjectMode && (
            <ProjectFilter
              projects={filters.projectOptions}
              selectedIds={filters.projectFilterIds}
              onToggle={(id) => {
                filters.setProjectFilterIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })
                filters.markModified()
              }}
              onClear={() => {
                filters.setProjectFilterIds(new Set())
                filters.markModified()
              }}
            />
          )}
        </div>
      )}
    </>
  )
})

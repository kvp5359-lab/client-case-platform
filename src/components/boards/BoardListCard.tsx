"use client"

import { lazy, Suspense } from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { BoardGroupDropZone, BoardListCardsDropZone } from './board-list/BoardListDropZones'
import { useBoardListCardSetup } from './hooks/useBoardListCardSetup'
import { DraggableBoardTaskRow } from './DraggableBoardTaskRow'
import { DraggableBoardProjectRow } from './DraggableBoardProjectRow'
import { BoardInboxList } from './BoardInboxList'
import { BoardListHeader } from './BoardListHeader'
// Lazy: react-big-calendar (~5 МБ) и date-fns локали грузим, только когда
// у списка реально включён режим календаря. В первый бандл досок не попадает.
const BoardListCalendarView = lazy(() =>
  import('./BoardListCalendarView').then((m) => ({ default: m.BoardListCalendarView })),
)
import { ListSettingsDialog } from './ListSettingsDialog'
// Lazy: ChatSettingsDialog тянет Tiptap (~200 KB) через ComposeField.
const ChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)
import type { BoardCardDndState, BoardGlobalFilter, BoardList } from './types'
import type { FilterContext } from '@/lib/filters/types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/common/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'

type BoardListCardProps = {
  list: BoardList
  tasks: WorkspaceTask[]
  projects: BoardProject[]
  inboxThreads: InboxThreadEntry[]
  assigneesMap: Record<string, AvatarParticipant[]>
  filterCtx: FilterContext
  workspaceId: string
  statuses: StatusOption[]
  onOpenTask: (taskId: string) => void
  onOpenThread: (task: TaskItem) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  /** Удалить задачу (мягко в корзину) — для поля `menu` в карточке. */
  onDeleteTask?: (task: WorkspaceTask) => void
  /** Сменить дедлайн задачи — для поля `menu`. */
  onDeadlineChange?: (taskId: string, deadline: string | null) => void
  selectedThreadId?: string | null
  selectedProjectId?: string | null
  existingColumns?: number
  isFirst?: boolean
  isLast?: boolean
  siblingLists?: BoardList[]
  columnWidth?: number
  /** Фильтр всей доски (этап 4.1). Применяется AND к list.filters
   *  для соответствующего entity_type. Inbox-списки игнорируют. */
  boardGlobalFilter?: BoardGlobalFilter
  /** Состояние card-DnD из BoardView (этап 4.5) — для подсветки группы/списка
   *  во время drag. Сама DnD-логика обрабатывается на уровне BoardView. */
  boardCardDnd?: BoardCardDndState
}

export function BoardListCard({
  list,
  tasks,
  projects,
  inboxThreads,
  assigneesMap,
  filterCtx,
  workspaceId,
  statuses,
  onOpenTask,
  onOpenThread,
  onStatusChange,
  onDeleteTask,
  onDeadlineChange,
  selectedThreadId,
  selectedProjectId,
  existingColumns,
  isFirst,
  isLast,
  siblingLists,
  columnWidth,
  boardGlobalFilter,
  boardCardDnd,
}: BoardListCardProps) {
  const {
    userCollapsed,
    setUserCollapsed,
    settingsDialog,
    createDialog,
    calendarSlot,
    setCalendarSlot,
    isProject,
    isInbox,
    isCards,
    isCalendar,
    listHeight,
    heightClass,
    hasGrouping,
    hasFilters,
    createPreset,
    handleCreate,
    createPending,
    nextTaskByProjectId,
    authorNameByUserId,
    filteredTasks,
    filteredProjects,
    groups,
    projectGroups,
    activeGroupKey,
    activeListCardsId,
    indicatorForRow,
  } = useBoardListCardSetup({
    list,
    tasks,
    projects,
    assigneesMap,
    filterCtx,
    workspaceId,
    statuses,
    boardGlobalFilter,
    boardCardDnd,
  })

  const count = isInbox ? inboxThreads.length : isProject ? filteredProjects.length : filteredTasks.length
  const collapsed = userCollapsed ?? (!isInbox && count === 0)

  return (
    <div className={cn('rounded-lg', listHeight === 'full' && 'flex flex-col flex-1 min-h-0')}>
      <BoardListHeader
        list={list}
        count={count}
        collapsed={collapsed}
        onToggleCollapse={() => setUserCollapsed(!collapsed)}
        onOpenSettings={settingsDialog.open}
        onCreateThread={list.entity_type === 'thread' ? createDialog.open : undefined}
        hasFilters={hasFilters}
        isInbox={isInbox}
        isFirst={isFirst}
        isLast={isLast}
        siblingLists={siblingLists}
      />

      {/* BoardListCardsDropZone должен рендериться ВСЕГДА (даже у свёрнутых
          списков — иначе пустая колонка воронки не сможет быть drop-target,
          т.к. она автосворачивается при count=0). Содержимое внутри
          скрывается отдельно через {!collapsed}. */}
      <BoardListCardsDropZone
        listId={list.id}
        isActive={activeListCardsId === `list-cards:${list.id}`}
        fullHeight={listHeight === 'full'}
      >
        {!collapsed && (
          <div className={cn(heightClass, 'mt-1 overflow-y-auto scrollbar-hide', !isCards && !hasGrouping && 'rounded-lg border border-border/50 bg-white')}>
            {isInbox ? (
              <BoardInboxList
                threads={inboxThreads}
                onOpenThread={onOpenThread}
                selectedThreadId={selectedThreadId}
                defaultFilter={(list.filters as unknown as { default_filter?: string })?.default_filter === 'unread' ? 'unread' : 'all'}
                workspaceId={workspaceId}
              />
            ) : isProject ? (
              filteredProjects.length > 0 ? (
                <div className={cn(isCards ? 'grid gap-1' : hasGrouping ? 'flex flex-col gap-2' : 'divide-y divide-border/50')}>
                  {projectGroups.map((group) => (
                    <BoardGroupDropZone
                      key={group.key}
                      listId={list.id}
                      groupKey={group.key}
                      isActive={activeGroupKey === `group:${list.id}:${group.key}`}
                    >
                      {hasGrouping && (
                        <div className={cn('px-0 pb-1')}>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                              !group.color && 'bg-muted-foreground/10 text-muted-foreground',
                            )}
                            style={
                              group.color
                                ? {
                                    backgroundColor: `${group.color}1A`,
                                    color: group.color,
                                  }
                                : undefined
                            }
                          >
                            {group.label}
                            <span className="opacity-50">{group.projects.length}</span>
                          </span>
                        </div>
                      )}
                      <SortableContext
                        items={group.projects.map((p) => `project:${p.id}:${list.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className={cn(
                          isCards
                            ? 'grid grid-cols-1 gap-1'
                            : hasGrouping
                              ? 'divide-y divide-border/50 rounded-lg border border-border/50 bg-white overflow-hidden'
                              : 'divide-y divide-border/50'
                        )}>
                          {group.projects.map((project) => (
                            <DraggableBoardProjectRow
                              key={project.id}
                              listId={list.id}
                              project={project}
                              workspaceId={workspaceId}
                              displayMode={list.display_mode ?? 'list'}
                              visibleFields={list.visible_fields ?? ['status', 'template']}
                              isSelected={selectedProjectId === project.id}
                              cardLayout={list.card_layout}
                              nextTask={nextTaskByProjectId[project.id]}
                              authorName={project.created_by ? authorNameByUserId[project.created_by] : null}
                              dropIndicator={indicatorForRow('project', project.id)}
                              justDropped={boardCardDnd?.recentlyDroppedId === `project:${project.id}`}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </BoardGroupDropZone>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  {hasFilters ? 'Нет элементов по фильтру' : 'Пусто'}
                </div>
              )
            ) : isCalendar ? (
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Загружаю календарь…</div>}>
                <BoardListCalendarView
                  listId={list.id}
                  workspaceId={workspaceId}
                  tasks={filteredTasks}
                  onOpenTask={(task) => onOpenTask(task.id)}
                  settings={list.calendar_settings}
                  listHeight={listHeight}
                  onCreateAtSlot={(start, end) => {
                    setCalendarSlot({ start: start.toISOString(), end: end.toISOString() })
                    createDialog.open()
                  }}
                />
              </Suspense>
            ) : filteredTasks.length > 0 ? (
              hasGrouping ? (
                <div className={cn(isCards ? 'grid gap-1' : 'flex flex-col gap-2')}>
                  {groups.map((group) => (
                    <BoardGroupDropZone
                      key={group.key}
                      listId={list.id}
                      groupKey={group.key}
                      isActive={activeGroupKey === `group:${list.id}:${group.key}`}
                    >
                      <div className={cn('px-2 pb-1', isCards && 'px-0 pb-1')}>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted-foreground/10 text-[11px] font-medium text-muted-foreground">
                          {group.label}
                          <span className="opacity-50">{group.tasks.length}</span>
                        </span>
                      </div>
                      <SortableContext
                        items={group.tasks.map((t) => `task:${t.id}:${list.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className={cn(
                          isCards
                            ? 'grid grid-cols-1 gap-1'
                            : 'divide-y divide-border/50 rounded-lg border border-border/50 bg-white overflow-hidden'
                        )}>
                          {group.tasks.map((task) => (
                            <DraggableBoardTaskRow
                              key={task.id}
                              listId={list.id}
                              task={task}
                              workspaceId={workspaceId}
                              assignees={assigneesMap[task.id] ?? []}
                              statuses={statuses}
                              visibleFields={list.visible_fields ?? ['status', 'deadline', 'assignees', 'project']}
                              displayMode={list.display_mode ?? 'list'}
                              onOpenTask={onOpenTask}
                              onStatusChange={onStatusChange}
                              onDeleteTask={onDeleteTask}
                              onDeadlineChange={onDeadlineChange}
                              isSelected={selectedThreadId === task.id}
                              cardLayout={list.card_layout}
                              dropIndicator={indicatorForRow('thread', task.id)}
                              justDropped={boardCardDnd?.recentlyDroppedId === `thread:${task.id}`}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </BoardGroupDropZone>
                  ))}
                </div>
              ) : (
                <SortableContext
                  items={filteredTasks.map((t) => `task:${t.id}:${list.id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className={cn(isCards ? 'grid grid-cols-1 gap-1' : 'divide-y divide-border/50')}>
                    {filteredTasks.map((task) => (
                      <DraggableBoardTaskRow
                        key={task.id}
                        listId={list.id}
                        task={task}
                        workspaceId={workspaceId}
                        assignees={assigneesMap[task.id] ?? []}
                        statuses={statuses}
                        visibleFields={list.visible_fields ?? ['status', 'deadline', 'assignees', 'project']}
                        displayMode={list.display_mode ?? 'list'}
                        onOpenTask={onOpenTask}
                        onStatusChange={onStatusChange}
                        onDeleteTask={onDeleteTask}
                        onDeadlineChange={onDeadlineChange}
                        isSelected={selectedThreadId === task.id}
                        cardLayout={list.card_layout}
                        dropIndicator={indicatorForRow('thread', task.id)}
                        justDropped={boardCardDnd?.recentlyDroppedId === `thread:${task.id}`}
                      />
                    ))}
                  </div>
                </SortableContext>
              )
            ) : (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {hasFilters ? 'Нет элементов по фильтру' : 'Пусто'}
              </div>
            )}
          </div>
        )}
      </BoardListCardsDropZone>

      <ListSettingsDialog
        open={settingsDialog.isOpen}
        onClose={settingsDialog.close}
        list={list}
        workspaceId={workspaceId}
        existingColumns={existingColumns}
        columnWidth={columnWidth}
      />

      {createDialog.isOpen && list.entity_type === 'thread' && (
        <Suspense fallback={null}>
          <ChatSettingsDialog
            chat={null}
            workspaceId={workspaceId}
            projectId={createPreset?.projectId}
            defaultTabMode={createPreset?.tabMode ?? 'task'}
            initialValues={
              calendarSlot
                ? { ...(createPreset ?? {}), startAt: calendarSlot.start, endAt: calendarSlot.end }
                : createPreset
            }
            open={createDialog.isOpen}
            onOpenChange={(v) => {
              if (v) createDialog.open()
              else {
                createDialog.close()
                setCalendarSlot(null)
              }
            }}
            onCreate={handleCreate}
            isPending={createPending}
          />
        </Suspense>
      )}
    </div>
  )
}

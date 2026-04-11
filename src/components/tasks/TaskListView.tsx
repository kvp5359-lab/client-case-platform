"use client"

/**
 * TaskListView — переиспользуемый компонент списка задач.
 * Используется на странице «Все задачи» и во вкладке «Задачи» внутри проекта.
 *
 * Включает: вкладки «Мои задачи»/«Контроль», фильтры, поиск, группировку по срокам,
 * создание задачи, диалог задачи с мессенджером.
 *
 * Когда передан projectId — автоматически фильтрует по проекту, скрывает фильтр «Проект».
 */

import { useState, useMemo, useCallback, lazy, Suspense, memo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, Loader2, Search, X, Plus, List, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useWorkspaceTasks } from '@/hooks/tasks/useWorkspaceTasks'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { messengerKeys, taskKeys } from '@/hooks/queryKeys'
import { useProjectThreads, useDeleteThread } from '@/hooks/messenger/useProjectThreads'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { DeleteThreadDialog } from '@/components/messenger/DeleteThreadDialog'
import { useAccessibleThreadIds } from '@/hooks/messenger/useAccessibleThreadIds'
import { useAuth } from '@/contexts/AuthContext'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { getCurrentWorkspaceParticipant } from '@/services/api/messenger/messengerService'
import type { ChatSettingsResult } from '@/components/messenger/chatSettingsTypes'
import type { TaskItem } from './types'

// Lazy-load: ChatSettingsDialog тянет Tiptap (~200 KB) через ComposeField.
// Грузим только когда юзер нажал "Создать задачу".
const ChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)

import { TaskPanel } from './TaskPanel'
import { useLayoutTaskPanel } from './TaskPanelContext'
import { useTaskAssigneesMap } from './useTaskAssignees'
import { useCurrentParticipantId } from '@/hooks/shared/useCurrentParticipantId'
import {
  useUpdateTaskStatus,
  useUpdateTaskDeadline,
  useRenameTask,
  useUpdateTaskSettings,
  useReorderTasks,
} from './useTaskMutations'

import { AssigneeFilter, DeadlineFilter, StatusFilter, ProjectFilter } from './filters'

import { workspaceTaskToItem, threadToItem, newThreadToTaskItem } from './taskListConstants'
import { useTaskFilters } from './useTaskFilters'
import { useCreateTaskHandler } from './useCreateTaskMutation'
import { TaskGroupList } from './TaskGroupList'
import { TaskPresetPopover } from './TaskPresetPopover'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'

// ── Props ──

interface TaskListViewProps {
  workspaceId: string
  /** Если передан — фильтрует задачи по проекту, скрывает фильтр «Проект», показывает showProject=false */
  projectId?: string
  /** Показывать название проекта в строке задачи (по умолчанию true если нет projectId) */
  showProject?: boolean
  /** Показывать ссылку на проект в диалоге задачи */
  showProjectLink?: boolean
}

export const TaskListView = memo(function TaskListView({
  workspaceId,
  projectId,
  showProject: showProjectProp,
  showProjectLink: showProjectLinkProp,
}: TaskListViewProps) {
  const router = useRouter()

  const isProjectMode = !!projectId
  const showProject = showProjectProp ?? !isProjectMode
  const showProjectLink = showProjectLinkProp ?? !isProjectMode

  // Layout-level TaskPanel: если контекст доступен, используем его
  // и не рендерим свой TaskPanel (панель живёт в WorkspaceLayout и не закрывается при смене вкладки).
  const layoutPanel = useLayoutTaskPanel()

  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  // Свежесозданный тред — используется пока он не появится в кеше
  const [createdThread, setCreatedThread] = useState<TaskItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [presetPopoverOpen, setPresetPopoverOpen] = useState(false)
  const [deletingTask, setDeletingTask] = useState<TaskItem | null>(null)

  // ── Загрузка данных ──

  const { data: rawWorkspaceTasks = [], isLoading: isLoadingWorkspace } = useWorkspaceTasks(
    isProjectMode ? undefined : workspaceId,
  )
  const { data: rawThreads = [], isLoading: isLoadingThreads } = useProjectThreads(
    isProjectMode ? projectId : undefined,
  )
  const { accessibleThreadIds } = useAccessibleThreadIds(isProjectMode ? projectId : undefined)

  const isLoading = isProjectMode ? isLoadingThreads : isLoadingWorkspace

  const allTasks = useMemo(() => {
    if (isProjectMode) {
      return rawThreads
        .filter((t) => !t.is_deleted && accessibleThreadIds.has(t.id))
        .map(threadToItem)
    }
    return rawWorkspaceTasks.map(workspaceTaskToItem)
  }, [isProjectMode, rawWorkspaceTasks, rawThreads, accessibleThreadIds])

  const taskIds = useMemo(() => allTasks.map((t) => t.id), [allTasks])
  const { data: membersMap = {} } = useTaskAssigneesMap(taskIds)
  const { data: currentParticipantId = null } = useCurrentParticipantId(workspaceId)
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)

  // ── Фильтры ──

  const filters = useTaskFilters({
    allTasks,
    membersMap,
    taskStatuses,
    currentParticipantId,
    isProjectMode,
  })

  // ── Создание задачи ──

  const { user } = useAuth()
  const setPendingInitialMessage = useSidePanelStore((s) => s.setPendingInitialMessage)

  const handleCreateSuccess = useCallback(
    async (newThread: ProjectThread, result: ChatSettingsResult) => {
      // Обработка первого сообщения / email
      if (result.initialMessage && user) {
        let senderName = 'Вы'
        try {
          const p = await getCurrentWorkspaceParticipant(workspaceId, user.id)
          if (p) senderName = p.name
        } catch { /* fallback */ }

        setPendingInitialMessage({
          threadId: newThread.id,
          html: result.initialMessage.html,
          files: result.initialMessage.files,
          isEmail: result.channelType === 'email',
          senderName,
        })
      }

      setCreateOpen(false)
      const taskItem = newThreadToTaskItem(newThread, result)
      setCreatedThread(taskItem)
      if (layoutPanel) {
        layoutPanel.openThread(taskItem)
      } else {
        setOpenTaskId(newThread.id)
      }
    },
    [workspaceId, user, setPendingInitialMessage, layoutPanel],
  )

  const { handleCreate, isPending: createPending } = useCreateTaskHandler({
    workspaceId,
    projectId,
    onSuccess: handleCreateSuccess,
  })

  // ── Мутации ──

  const invalidateKeys = useMemo(() => {
    const keys: Array<readonly unknown[]> = [
      taskKeys.workspace(workspaceId),
      taskKeys.urgentCount(workspaceId),
    ]
    if (projectId) {
      keys.push(messengerKeys.projectThreads(projectId))
    }
    return keys
  }, [workspaceId, projectId])

  const updateStatus = useUpdateTaskStatus(invalidateKeys)
  const updateDeadline = useUpdateTaskDeadline(invalidateKeys)
  const renameTask = useRenameTask(invalidateKeys)
  const updateSettings = useUpdateTaskSettings(invalidateKeys)
  const reorderTasks = useReorderTasks(invalidateKeys)
  const deleteThread = useDeleteThread(workspaceId)

  const handleConfirmDelete = useCallback(() => {
    if (!deletingTask) return
    deleteThread.mutate(
      {
        id: deletingTask.id,
        name: deletingTask.name,
        type: deletingTask.type,
        project_id: deletingTask.project_id,
      },
      {
        onSuccess: () => {
          setDeletingTask(null)
          if (openTaskId === deletingTask.id) {
            setOpenTaskId(null)
            if (layoutPanel) layoutPanel.closeThread()
          }
        },
      },
    )
  }, [deletingTask, deleteThread, openTaskId, layoutPanel])

  // ── Вспомогательные данные ──

  const allAssignees = useMemo(() => {
    const map = new Map<string, AvatarParticipant>()
    for (const members of Object.values(membersMap)) {
      for (const m of members) {
        if (!map.has(m.id)) map.set(m.id, m)
      }
    }
    return Array.from(map.values())
  }, [membersMap])

  const openTask = allTasks.find((t) => t.id === openTaskId)
    ?? (createdThread?.id === openTaskId ? createdThread : null)

  const hasLayoutPanel = !!layoutPanel

  // Открытие задачи: через layout TaskPanel (если доступен) или через локальный
  const handleOpenTask = useCallback(
    (taskId: string) => {
      if (layoutPanel) {
        const task = allTasks.find((t) => t.id === taskId)
          ?? (createdThread?.id === taskId ? createdThread : null)
        if (task) layoutPanel.openThread(task)
      } else {
        setOpenTaskId(taskId)
      }
    },
    [layoutPanel, allTasks, createdThread],
  )

  // ── Рендер ──

  return (
    <div className="max-w-[789px]">
      {/* Строка: Кнопка фильтра (группа: попап + chevron) + Поиск + Создать */}
      <div className={cn('flex items-center gap-2', filtersOpen ? 'mb-1.5' : 'mb-4')}>
        <TaskPresetPopover
          preset={filters.preset}
          filtersModified={filters.filtersModified}
          filtersOpen={filtersOpen}
          presetPopoverOpen={presetPopoverOpen}
          onPresetPopoverChange={setPresetPopoverOpen}
          onApplyPreset={filters.applyPreset}
          onToggleFilters={() => setFiltersOpen((v) => !v)}
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
          onClick={() => setCreateOpen(true)}
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
            selectedValues={filters.deadlineFilter}
            onToggle={(v) => {
              filters.setDeadlineFilter((prev) => {
                const next = new Set(prev)
                if (next.has(v)) next.delete(v)
                else next.add(v)
                return next
              })
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

      {/* Контент */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : allTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <CheckSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Пока ничего нет</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Создать
          </Button>
        </div>
      ) : filters.filteredTasks.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {filters.effectiveAssigneeFilter.size > 0 ||
          filters.deadlineFilter.size > 0 ||
          filters.projectFilterIds.size > 0
            ? 'Ничего не найдено по выбранным фильтрам'
            : 'Ничего не найдено'}
        </div>
      ) : (
        <TaskGroupList
          grouped={filters.grouped}
          completedTasks={filters.completedTasks}
          groupByDeadline={filters.groupByDeadline}
          workspaceId={workspaceId}
          taskStatuses={taskStatuses}
          membersMap={membersMap}
          showProject={showProject}
          onOpenTask={handleOpenTask}
          onStatusChange={(taskId, statusId) => updateStatus.mutate({ threadId: taskId, statusId })}
          onDeadlineSet={(taskId, date) =>
            updateDeadline.mutate({ threadId: taskId, deadline: date.toISOString() })
          }
          onDeadlineClear={(taskId) => updateDeadline.mutate({ threadId: taskId, deadline: null })}
          onReorder={(updates) => reorderTasks.mutate(updates)}
          onRequestDeleteTask={(task) => setDeletingTask(task)}
          deadlinePending={updateDeadline.isPending}
          finalStatusIds={new Set(taskStatuses.filter((s) => s.is_final).map((s) => s.id))}
        />
      )}

      {/* Панель задачи (правая боковая) — только если нет layout-level панели */}
      {!hasLayoutPanel && (
        <TaskPanel
          task={openTask}
          open={!!openTaskId}
          onClose={() => { setOpenTaskId(null); setCreatedThread(null) }}
          workspaceId={workspaceId}
          statuses={taskStatuses}
          members={membersMap[openTask?.id ?? ''] ?? []}
          onStatusChange={(statusId) =>
            openTask && updateStatus.mutate({ threadId: openTask.id, statusId })
          }
          onDeadlineSet={(date) =>
            openTask && updateDeadline.mutate({ threadId: openTask.id, deadline: date.toISOString() })
          }
          onDeadlineClear={() =>
            openTask && updateDeadline.mutate({ threadId: openTask.id, deadline: null })
          }
          onRename={(name) => openTask && renameTask.mutate({ threadId: openTask.id, name })}
          onSettingsSave={(params) =>
            openTask && updateSettings.mutate({ threadId: openTask.id, ...params })
          }
          deadlinePending={updateDeadline.isPending}
          settingsPending={updateSettings.isPending}
          showProjectLink={showProjectLink && !!openTask?.project_id}
          onProjectClick={() => {
            if (openTask?.project_id) {
              setOpenTaskId(null)
              router.push(`/workspaces/${workspaceId}/projects/${openTask.project_id}`)
            }
          }}
        />
      )}

      {/* Диалог создания задачи — монтируется только когда открыт */}
      {createOpen && (
        <Suspense fallback={null}>
          <ChatSettingsDialog
            chat={null}
            workspaceId={workspaceId}
            projectId={projectId}
            defaultThreadType="task"
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreate={handleCreate}
            isPending={createPending}
          />
        </Suspense>
      )}

      {/* Диалог подтверждения удаления задачи */}
      <DeleteThreadDialog
        thread={deletingTask ? { name: deletingTask.name, type: deletingTask.type } : null}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingTask(null)}
      />
    </div>
  )
})

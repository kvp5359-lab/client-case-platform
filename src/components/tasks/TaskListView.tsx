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

import { useState, useMemo, useCallback, useEffect, lazy, Suspense, memo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, Plus } from 'lucide-react'
import { PageLoader } from '@/components/ui/loaders'
import { Button } from '@/components/ui/button'
import { useWorkspaceThreads } from '@/hooks/tasks/useWorkspaceThreads'
import { useTaskStatuses } from '@/hooks/useStatuses'
import {
  messengerKeys,
  workspaceThreadKeys,
  myTaskCountsKeys,
  projectTemplateKeys,
} from '@/hooks/queryKeys'
import { useProjectThreads, useDeleteThread } from '@/hooks/messenger/useProjectThreads'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { DeleteThreadDialog } from '@/components/messenger/DeleteThreadDialog'
import { useAccessibleThreadIds } from '@/hooks/messenger/useAccessibleThreadIds'
import type { ChatSettingsResult } from '@/components/messenger/chatSettingsTypes'
import { useQueueThreadInitialMessage } from './useQueueThreadInitialMessage'
import type { ThreadTemplate } from '@/types/threadTemplate'
import { useThreadTemplatesForProject, useThreadTemplates } from '@/hooks/messenger/useThreadTemplates'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TaskItem } from './types'

import { LazyChatSettingsDialog as ChatSettingsDialog } from '@/components/lazyChatSettingsDialog'

// Lazy-импорт TaskPanel — рвём цикл TaskListView → TaskPanel → TaskPanelProjectView → TaskListView.
// Панель здесь — fallback на случай отсутствия layout-level TaskPanel.
const TaskPanel = lazy(() =>
  import('./TaskPanel').then((m) => ({ default: m.TaskPanel })),
)
import { useLayoutTaskPanel } from './TaskPanelContext'
import { useTaskAssigneesMap } from './useTaskAssignees'
import { useCurrentParticipantId } from '@/hooks/shared/useCurrentParticipantId'
import { useWorkspacePermissions } from '@/hooks/permissions'
import {
  useUpdateTaskStatus,
  useUpdateTaskDeadline,
  useRenameTask,
  useUpdateTaskSettings,
  useReorderTasks,
} from './useTaskMutations'

import { TaskListControls } from './TaskListControls'

import { workspaceTaskToItem, threadToItem, newThreadToTaskItem } from './taskListConstants'
import { useTaskFilters } from './useTaskFilters'
import { useCreateTaskHandler } from './useCreateTaskMutation'
import { TaskGroupList } from './TaskGroupList'
import { ProjectFlatPlanList } from '@/components/plan/ProjectFlatPlanList'
import { usePlanBlockVisibility } from '@/hooks/plan/usePlanBlockVisibility'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'

// ── Props ──

type TaskListViewProps = {
  workspaceId: string
  /** Если передан — фильтрует задачи по проекту, скрывает фильтр «Проект», показывает showProject=false */
  projectId?: string
  /** Показывать название проекта в строке задачи (по умолчанию true если нет projectId) */
  showProject?: boolean
  /** Показывать ссылку на проект в диалоге задачи */
  showProjectLink?: boolean
  /** Стартовый projectFilter — переопределяет дефолт useTaskFilters.
   *  Используется на странице /tasks?filter=no_project для пресета «Без проекта». */
  initialProjectFilterIds?: Set<string>
  /** Стартовый preset — по умолчанию my_active в workspace-режиме.
   *  Для «Без проекта» лучше 'all' чтобы не отсекать постановщиком. */
  initialPreset?: 'all' | 'my_active' | 'active' | 'control'
}

export const TaskListView = memo(function TaskListView({
  workspaceId,
  projectId,
  showProject: showProjectProp,
  showProjectLink: showProjectLinkProp,
  initialProjectFilterIds,
  initialPreset,
}: TaskListViewProps) {
  const router = useRouter()

  const isProjectMode = !!projectId
  const showProject = showProjectProp ?? !isProjectMode
  const showProjectLink = showProjectLinkProp ?? !isProjectMode

  // Layout-level TaskPanel: если контекст доступен, используем его
  // и не рендерим свой TaskPanel (панель живёт в WorkspaceLayout и не закрывается при смене вкладки).
  const layoutPanel = useLayoutTaskPanel()

  // Push-режим правой панели: на странице задач панель отжимает контент
  // влево, а не накладывается поверх. Атрибут читает CSS в globals.css.
  useEffect(() => {
    document.body.setAttribute('data-panel-mode', 'push')
    return () => document.body.removeAttribute('data-panel-mode')
  }, [])

  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  // Свежесозданный тред — используется пока он не появится в кеше
  const [createdThread, setCreatedThread] = useState<TaskItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createDefaultType, setCreateDefaultType] = useState<'task' | 'chat' | 'email'>('task')
  const [createTemplate, setCreateTemplate] = useState<ThreadTemplate | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const planVis = usePlanBlockVisibility()
  const [presetPopoverOpen, setPresetPopoverOpen] = useState(false)
  const [deletingTask, setDeletingTask] = useState<TaskItem | null>(null)

  // ── Загрузка данных ──

  const { data: rawWorkspaceTasks = [], isLoading: isLoadingWorkspace } = useWorkspaceThreads(
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
  const { data: rawMembersMap } = useTaskAssigneesMap(taskIds)
  // useMemo, чтобы default {} не давал новую ссылку на каждом рендере и
  // не ломал мемоизацию allAssignees ниже.
  const membersMap = useMemo(() => rawMembersMap ?? {}, [rawMembersMap])
  const { data: currentParticipantId = null } = useCurrentParticipantId(workspaceId)
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)

  // Загружаем template_id проекта (если в проектном режиме) — чтобы попап
  // создания показывал релевантные шаблоны тредов.
  const { data: projectTemplateId } = useQuery<string | null>({
    queryKey: projectTemplateKeys.idByProject(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) return null
      const { data } = await supabase
        .from('projects')
        .select('template_id')
        .eq('id', projectId)
        .maybeSingle()
      return (data?.template_id as string | null) ?? null
    },
  })
  const { data: projectThreadTemplates = [] } = useThreadTemplatesForProject(
    isProjectMode ? workspaceId : undefined,
    projectTemplateId,
  )
  const { data: globalThreadTemplates = [] } = useThreadTemplates(
    isProjectMode ? undefined : workspaceId,
  )
  const threadTemplates = isProjectMode ? projectThreadTemplates : globalThreadTemplates

  // ── Фильтры ──

  const filters = useTaskFilters({
    allTasks,
    membersMap,
    taskStatuses,
    currentParticipantId,
    isProjectMode,
    initialProjectFilterIds,
    initialPreset,
  })

  // ── Создание задачи ──

  const queueInitialMessage = useQueueThreadInitialMessage(workspaceId)

  const handleCreateSuccess = useCallback(
    async (newThread: ProjectThread, result: ChatSettingsResult) => {
      await queueInitialMessage(newThread, result)

      setCreateOpen(false)
      const taskItem = newThreadToTaskItem(newThread, result)
      setCreatedThread(taskItem)
      if (layoutPanel) {
        layoutPanel.openThread(taskItem)
      } else {
        setOpenTaskId(newThread.id)
      }
    },
    [queueInitialMessage, layoutPanel],
  )

  const { handleCreate, isPending: createPending } = useCreateTaskHandler({
    workspaceId,
    projectId,
    onSuccess: handleCreateSuccess,
  })

  // ── Мутации ──

  const invalidateKeys = useMemo(() => {
    const keys: Array<readonly unknown[]> = [
      workspaceThreadKeys.workspace(workspaceId),
      myTaskCountsKeys.byWorkspace(workspaceId),
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
  // Удаление задачи — только владельцу воркспейса. RLS на стороне БД пускает
  // любого с доступом к треду, но клиент гейтит UI чтобы не показывать кнопку
  // клиентам/исполнителям (иначе они тыкают и БД пропускает мягкое удаление).
  const { isOwner: isWorkspaceOwner } = useWorkspacePermissions({ workspaceId })

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

  const finalStatusIds = useMemo(
    () => new Set(taskStatuses.filter((s) => s.is_final).map((s) => s.id)),
    [taskStatuses],
  )

  // Режим «план»: проектный список в ручном плоском порядке без активных
  // фильтров/поиска. Тогда показываем объединённый список (задачи + текст +
  // слоты). Любой фильтр/сортировка/группировка → обычный TaskGroupList.
  const planMode =
    isProjectMode &&
    !!projectId &&
    !filters.groupByDeadline &&
    filters.preset === 'all' &&
    !filters.searchQuery.trim() &&
    filters.assigneeFilterIds === null &&
    filters.deadlineFilter === null &&
    filters.statusFilterIds === null &&
    filters.projectFilterIds.size === 0

  // ── Рендер ──

  return (
    <div className="max-w-[789px]">
      <TaskListControls
        filters={filters}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
        presetPopoverOpen={presetPopoverOpen}
        onPresetPopoverChange={setPresetPopoverOpen}
        onCreate={(kind, template) => {
          setCreateDefaultType(kind)
          setCreateTemplate(template ?? null)
          setCreateOpen(true)
        }}
        threadTemplates={threadTemplates}
        isProjectMode={isProjectMode}
        allAssignees={allAssignees}
        currentParticipantId={currentParticipantId}
        taskStatuses={taskStatuses}
        planVis={planVis}
        showPlanToggles={planMode}
      />

      {/* Контент */}
      {isLoading ? (
        <PageLoader />
      ) : planMode ? (
        <ProjectFlatPlanList
          projectId={projectId!}
          workspaceId={workspaceId}
          tasks={filters.filteredTasks}
          taskStatuses={taskStatuses}
          membersMap={membersMap}
          finalStatusIds={finalStatusIds}
          selectedThreadId={layoutPanel?.activeThreadId ?? null}
          showProject={showProject}
          deadlinePending={updateDeadline.isPending}
          showHeadings={planVis.showHeadings}
          showText={planVis.showText}
          showSlots={planVis.showSlots}
          onOpenTask={handleOpenTask}
          onStatusChange={(taskId, statusId) => updateStatus.mutate({ threadId: taskId, statusId })}
          onDeadlineSet={(taskId, date) =>
            updateDeadline.mutate({ threadId: taskId, deadline: date.toISOString() })
          }
          onDeadlineClear={(taskId) => updateDeadline.mutate({ threadId: taskId, deadline: null })}
          onTimeChange={(taskId, v) =>
            updateDeadline.mutate({
              threadId: taskId,
              deadline: v.deadline,
              start_at: v.startAt,
              end_at: v.endAt,
            })
          }
          onReorderTasks={(updates) => reorderTasks.mutate(updates)}
          onRequestDeleteTask={isWorkspaceOwner ? (task) => setDeletingTask(task) : undefined}
        />
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
          filters.effectiveDeadlineFilter.size > 0 ||
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
          onTimeChange={(taskId, v) =>
            updateDeadline.mutate({
              threadId: taskId,
              deadline: v.deadline,
              start_at: v.startAt,
              end_at: v.endAt,
            })
          }
          onReorder={(updates) => reorderTasks.mutate(updates)}
          onRequestDeleteTask={isWorkspaceOwner ? (task) => setDeletingTask(task) : undefined}
          deadlinePending={updateDeadline.isPending}
          finalStatusIds={new Set(taskStatuses.filter((s) => s.is_final).map((s) => s.id))}
          selectedThreadId={layoutPanel?.activeThreadId ?? null}
        />
      )}

      {/* Панель задачи (правая боковая) — только если нет layout-level панели */}
      {!hasLayoutPanel && (
        <Suspense fallback={null}>
        <TaskPanel
          stackTop={openTask ? { kind: 'task', task: openTask } : null}
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
          onTimeChange={(v) =>
            openTask &&
            updateDeadline.mutate({
              threadId: openTask.id,
              deadline: v.deadline,
              start_at: v.startAt,
              end_at: v.endAt,
            })
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
        </Suspense>
      )}

      {/* Диалог создания задачи — монтируется только когда открыт */}
      {createOpen && (
        <Suspense fallback={null}>
          <ChatSettingsDialog
            chat={null}
            workspaceId={workspaceId}
            projectId={projectId}
            defaultThreadType={createDefaultType === 'task' ? 'task' : 'chat'}
            defaultTabMode={createDefaultType}
            initialTemplate={createTemplate ?? undefined}
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open)
              if (!open) {
                setCreateTemplate(null)
                setCreateDefaultType('task')
              }
            }}
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

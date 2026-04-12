"use client"

/**
 * useTaskPanelSetup — единый хук для подключения TaskPanel.
 * Инкапсулирует: стек открытых элементов панели, мутации, конвертацию и рендер-пропсы.
 * Используется в TaskListView, InboxPage, WorkspaceLayout, BoardsPage.
 *
 * ── Стек навигации ──
 * В панели живёт стек элементов двух типов:
 *   - `{ kind: 'task', task: TaskItem }` — открытая задача/чат/email (Режим 1).
 *   - `{ kind: 'project', project: ProjectHeaderInfo }` — открытый список задач
 *     проекта (Режим 2: шапка проекта + TaskListView внутри).
 *
 * Наверх стека отдаётся активный элемент: `openThread` для задачи, `openProject`
 * для проекта. Для обратной совместимости с потребителями сохранён `openThread`
 * (возвращает TaskItem | null только если верхний элемент — задача).
 *
 * ── API ──
 * - `setOpenThread(task)` — внешнее открытие задачи: сбрасывает весь стек и кладёт
 *   одну задачу. Используется TaskListView, InboxPage, тостами новых сообщений.
 * - `openProject(project)` — внешнее открытие проекта: сбрасывает стек и кладёт
 *   один проект. Используется BoardProjectRow (клик на проект на доске).
 * - `pushThread(task)` — внутренняя навигация: кладёт задачу поверх стека,
 *   сохраняя историю. Используется TaskListView внутри Mode 2 для открытия
 *   задачи из списка проекта.
 * - `pushProject(project)` — то же для проекта. Используется кнопкой «Другие
 *   задачи» в открытой задаче: переключает панель на список задач её проекта,
 *   а сама задача остаётся ниже в стеке.
 * - `popThread()` — кнопка «назад», снимает верхний элемент.
 * - `close()` — полностью закрыть панель (сброс стека).
 *
 * Стек НЕ персистится — при перезагрузке страницы история теряется.
 * Лимит глубины: MAX_STACK. Превышение отбрасывает самый нижний элемент.
 * Дедупликация: если кладём элемент, который уже есть в стеке — срезаем стек
 * до того уровня (это предотвращает циклы A→B→A→B).
 */

import { useState, useMemo, useCallback } from 'react'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useTaskAssigneesMap } from './useTaskAssignees'
import {
  useUpdateTaskStatus,
  useUpdateTaskDeadline,
  useRenameTask,
  useUpdateTaskSettings,
} from './useTaskMutations'
import { workspaceThreadKeys } from '@/hooks/queryKeys'
import type { TaskItem } from './types'
import type { TaskPanelProps, ProjectHeaderInfo, PanelStackItem } from './TaskPanel'

const MAX_STACK = 7

interface UseTaskPanelSetupParams {
  workspaceId: string
  /** Дополнительные query keys для инвалидации */
  extraInvalidateKeys?: ReadonlyArray<readonly unknown[]>
}

/** Стабильный ID элемента стека — для дедупликации. */
function stackItemId(item: PanelStackItem): string {
  return item.kind === 'task' ? `task:${item.task.id}` : `project:${item.project.id}`
}

export function useTaskPanelSetup({ workspaceId, extraInvalidateKeys = [] }: UseTaskPanelSetupParams) {
  const [stack, setStack] = useState<PanelStackItem[]>([])

  const topItem = stack[stack.length - 1] ?? null
  const openThread: TaskItem | null = topItem?.kind === 'task' ? topItem.task : null
  const openProjectItem: ProjectHeaderInfo | null =
    topItem?.kind === 'project' ? topItem.project : null
  const canGoBack = stack.length > 1

  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)

  const threadIds = useMemo(() => (openThread ? [openThread.id] : []), [openThread])
  const { data: membersMap = {} } = useTaskAssigneesMap(threadIds)

  const invalidateKeys = useMemo(
    () => [workspaceThreadKeys.workspace(workspaceId), ...extraInvalidateKeys],
    [workspaceId, extraInvalidateKeys],
  )
  const updateStatus = useUpdateTaskStatus(invalidateKeys)
  const updateDeadline = useUpdateTaskDeadline(invalidateKeys)
  const renameTask = useRenameTask(invalidateKeys)
  const updateSettings = useUpdateTaskSettings(invalidateKeys)

  // ── Низкоуровневые операции со стеком ────────────────────

  /** Заменить стек одним элементом (внешнее открытие). */
  const replaceWith = useCallback((item: PanelStackItem | null) => {
    setStack(item ? [item] : [])
  }, [])

  /** Положить элемент поверх стека (внутренняя навигация).
   *  Дубликат на вершине — no-op. Если элемент уже есть в стеке ниже —
   *  срезаем стек до него (возврат, не добавление). */
  const pushItem = useCallback((item: PanelStackItem) => {
    setStack((prev) => {
      const newId = stackItemId(item)
      if (prev.length > 0 && stackItemId(prev[prev.length - 1]) === newId) return prev
      const existingIndex = prev.findIndex((i) => stackItemId(i) === newId)
      if (existingIndex !== -1) return prev.slice(0, existingIndex + 1)
      const next = [...prev, item]
      return next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next
    })
  }, [])

  /** Снять верхний элемент (кнопка «назад»). */
  const popThread = useCallback(() => {
    setStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
  }, [])

  /** Полностью закрыть панель — сбросить весь стек. */
  const close = useCallback(() => setStack([]), [])

  // ── Высокоуровневые методы по типам ──────────────────────

  /** Внешнее открытие задачи: сброс стека + одна задача. */
  const setOpenThread = useCallback(
    (task: TaskItem | null) => {
      replaceWith(task ? { kind: 'task', task } : null)
    },
    [replaceWith],
  )

  /** Push задачи поверх стека (внутренняя навигация). */
  const pushThread = useCallback(
    (task: TaskItem) => {
      pushItem({ kind: 'task', task })
    },
    [pushItem],
  )

  /** Внешнее открытие проекта: сброс стека + один проект. */
  const openProject = useCallback(
    (project: ProjectHeaderInfo) => {
      replaceWith({ kind: 'project', project })
    },
    [replaceWith],
  )

  /** Push проекта поверх стека (например, клик «Другие задачи» в задаче). */
  const pushProject = useCallback(
    (project: ProjectHeaderInfo) => {
      pushItem({ kind: 'project', project })
    },
    [pushItem],
  )

  /** Props для <TaskPanel /> — spread-ready */
  const taskPanelProps: Omit<TaskPanelProps, 'showProjectLink' | 'onProjectClick'> = {
    stackTop: topItem,
    open: !!topItem,
    onClose: close,
    onBack: popThread,
    canGoBack,
    onOpenThreadInStack: pushThread,
    onOpenProjectInStack: pushProject,
    workspaceId,
    statuses: taskStatuses,
    members: openThread ? membersMap[openThread.id] ?? [] : [],
    onStatusChange: (statusId) => {
      if (!openThread) return
      updateStatus.mutate({ threadId: openThread.id, statusId })
      setStack((prev) =>
        prev.map((item, i) =>
          i === prev.length - 1 && item.kind === 'task'
            ? { kind: 'task', task: { ...item.task, status_id: statusId } }
            : item,
        ),
      )
    },
    onDeadlineSet: (date) => {
      if (!openThread) return
      const iso = date.toISOString()
      updateDeadline.mutate({ threadId: openThread.id, deadline: iso })
      setStack((prev) =>
        prev.map((item, i) =>
          i === prev.length - 1 && item.kind === 'task'
            ? { kind: 'task', task: { ...item.task, deadline: iso } }
            : item,
        ),
      )
    },
    onDeadlineClear: () => {
      if (!openThread) return
      updateDeadline.mutate({ threadId: openThread.id, deadline: null })
      setStack((prev) =>
        prev.map((item, i) =>
          i === prev.length - 1 && item.kind === 'task'
            ? { kind: 'task', task: { ...item.task, deadline: null } }
            : item,
        ),
      )
    },
    onRename: (name) => {
      if (!openThread) return
      renameTask.mutate({ threadId: openThread.id, name })
      setStack((prev) =>
        prev.map((item, i) =>
          i === prev.length - 1 && item.kind === 'task'
            ? { kind: 'task', task: { ...item.task, name } }
            : item,
        ),
      )
    },
    onSettingsSave: (params) => {
      if (!openThread) return
      updateSettings.mutate({ threadId: openThread.id, ...params })
      setStack((prev) =>
        prev.map((item, i) =>
          i === prev.length - 1 && item.kind === 'task'
            ? {
                kind: 'task',
                task: {
                  ...item.task,
                  name: params.name,
                  accent_color: params.accent_color,
                  icon: params.icon,
                },
              }
            : item,
        ),
      )
    },
    deadlinePending: updateDeadline.isPending,
    settingsPending: updateSettings.isPending,
  }

  return {
    openThread,
    openProject: openProjectItem,
    setOpenThread,
    openProjectTasks: openProject,
    pushThread,
    pushProject,
    popThread,
    canGoBack,
    threadStack: stack,
    taskPanelProps,
    taskStatuses,
    membersMap,
    updateStatus,
    updateDeadline,
    renameTask,
    updateSettings,
  }
}

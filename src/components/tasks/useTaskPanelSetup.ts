"use client"

/**
 * useTaskPanelSetup — единый хук для подключения TaskPanel.
 * Инкапсулирует: стек открытых тредов, мутации, конвертацию и рендер-пропсы.
 * Используется в TaskListView, InboxPage, WorkspaceLayout, BoardsPage.
 *
 * ── Стек навигации ──
 * Вместо одного открытого треда внутри панели живёт стек. Наружу наверх
 * стека отдаётся `openThread` (для обратной совместимости с существующими
 * потребителями). Внутренние переходы (клик на соседний тред внутри панели)
 * кладут новый тред поверх стека через `pushThread`, а кнопка «назад»
 * снимает верхний через `popThread`. Внешние открытия (с доски, из списка
 * задач, из тостов) — всегда `replaceThread`, чтобы не смешивать пользовательскую
 * навигацию внутри панели с приходом «со стороны».
 *
 * Стек НЕ персистится — при перезагрузке страницы история теряется.
 * Лимит глубины: MAX_STACK. Превышение отбрасывает самый нижний элемент.
 * Дедупликация: если кладём тред, который уже есть в стеке — срезаем стек
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
import { taskKeys } from '@/hooks/queryKeys'
import type { TaskItem } from './types'
import type { TaskPanelProps } from './TaskPanel'

const MAX_STACK = 7

interface UseTaskPanelSetupParams {
  workspaceId: string
  /** Дополнительные query keys для инвалидации */
  extraInvalidateKeys?: ReadonlyArray<readonly unknown[]>
}

export function useTaskPanelSetup({ workspaceId, extraInvalidateKeys = [] }: UseTaskPanelSetupParams) {
  const [threadStack, setThreadStack] = useState<TaskItem[]>([])

  const openThread = threadStack[threadStack.length - 1] ?? null
  const canGoBack = threadStack.length > 1

  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)

  const threadIds = useMemo(() => (openThread ? [openThread.id] : []), [openThread])
  const { data: membersMap = {} } = useTaskAssigneesMap(threadIds)

  const invalidateKeys = useMemo(
    () => [taskKeys.workspace(workspaceId), ...extraInvalidateKeys],
    [workspaceId, extraInvalidateKeys],
  )
  const updateStatus = useUpdateTaskStatus(invalidateKeys)
  const updateDeadline = useUpdateTaskDeadline(invalidateKeys)
  const renameTask = useRenameTask(invalidateKeys)
  const updateSettings = useUpdateTaskSettings(invalidateKeys)

  /** Заменить верхний элемент стека. Используется для внешних открытий. */
  const replaceThread = useCallback((task: TaskItem | null) => {
    setThreadStack(task ? [task] : [])
  }, [])

  /** Положить тред поверх стека (внутренняя навигация в панели). */
  const pushThread = useCallback((task: TaskItem) => {
    setThreadStack((prev) => {
      // Дубликат на вершине — no-op
      if (prev.length > 0 && prev[prev.length - 1].id === task.id) return prev
      // Если тред уже был в стеке — срезаем до него (возврат, не добавление)
      const existingIndex = prev.findIndex((t) => t.id === task.id)
      if (existingIndex !== -1) return prev.slice(0, existingIndex + 1)
      // Лимит глубины — отбрасываем самый нижний
      const next = [...prev, task]
      return next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next
    })
  }, [])

  /** Снять верхний элемент (кнопка «назад»). Если стек опустел — панель закроется. */
  const popThread = useCallback(() => {
    setThreadStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
  }, [])

  /** Полностью закрыть панель — сбросить весь стек. */
  const close = useCallback(() => setThreadStack([]), [])

  /**
   * Обратная совместимость: `setOpenThread` ведёт себя как `replaceThread`.
   * Все текущие потребители (TaskListView, BoardsPage, InboxPage, тосты)
   * передают сюда «внешнее» открытие, и семантика «сбросить стек и показать один тред»
   * — правильная для их случая.
   */
  const setOpenThread = useCallback(
    (task: TaskItem | null) => {
      replaceThread(task)
    },
    [replaceThread],
  )

  /** Props для <TaskPanel /> — spread-ready */
  const taskPanelProps: Omit<TaskPanelProps, 'showProjectLink' | 'onProjectClick'> = {
    task: openThread,
    open: !!openThread,
    onClose: close,
    onBack: popThread,
    canGoBack,
    onOpenThreadInStack: pushThread,
    workspaceId,
    statuses: taskStatuses,
    members: membersMap[openThread?.id ?? ''] ?? [],
    onStatusChange: (statusId) => {
      if (!openThread) return
      updateStatus.mutate({ threadId: openThread.id, statusId })
      // Обновляем верхушку стека, сохраняя историю снизу
      setThreadStack((prev) =>
        prev.map((t, i) => (i === prev.length - 1 ? { ...t, status_id: statusId } : t)),
      )
    },
    onDeadlineSet: (date) => {
      if (!openThread) return
      const iso = date.toISOString()
      updateDeadline.mutate({ threadId: openThread.id, deadline: iso })
      setThreadStack((prev) =>
        prev.map((t, i) => (i === prev.length - 1 ? { ...t, deadline: iso } : t)),
      )
    },
    onDeadlineClear: () => {
      if (!openThread) return
      updateDeadline.mutate({ threadId: openThread.id, deadline: null })
      setThreadStack((prev) =>
        prev.map((t, i) => (i === prev.length - 1 ? { ...t, deadline: null } : t)),
      )
    },
    onRename: (name) => {
      if (!openThread) return
      renameTask.mutate({ threadId: openThread.id, name })
      setThreadStack((prev) =>
        prev.map((t, i) => (i === prev.length - 1 ? { ...t, name } : t)),
      )
    },
    onSettingsSave: (params) => {
      if (!openThread) return
      updateSettings.mutate({ threadId: openThread.id, ...params })
      setThreadStack((prev) =>
        prev.map((t, i) =>
          i === prev.length - 1
            ? { ...t, name: params.name, accent_color: params.accent_color, icon: params.icon }
            : t,
        ),
      )
    },
    deadlinePending: updateDeadline.isPending,
    settingsPending: updateSettings.isPending,
  }

  return {
    openThread,
    setOpenThread,
    pushThread,
    popThread,
    canGoBack,
    threadStack,
    taskPanelProps,
    taskStatuses,
    membersMap,
    updateStatus,
    updateDeadline,
    renameTask,
    updateSettings,
  }
}

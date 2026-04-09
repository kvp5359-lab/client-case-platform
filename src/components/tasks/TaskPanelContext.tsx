"use client"

/**
 * Контекст для открытия TaskPanel из layout-уровня.
 * WorkspaceLayout провайдит setOpenThread — дочерние компоненты
 * используют его вместо локального стейта, чтобы панель не закрывалась
 * при размонтировании (например, при переключении вкладок проекта).
 */

import { createContext, useContext } from 'react'
import type { TaskItem } from './types'

interface TaskPanelContextValue {
  openThread: (task: TaskItem) => void
  closeThread: () => void
}

export const TaskPanelContext = createContext<TaskPanelContextValue | null>(null)

export function useLayoutTaskPanel() {
  return useContext(TaskPanelContext)
}

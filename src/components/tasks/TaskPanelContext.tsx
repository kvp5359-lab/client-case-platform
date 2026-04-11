"use client"

/**
 * Контекст для открытия TaskPanel из layout-уровня.
 * WorkspaceLayout провайдит функции стека — дочерние компоненты
 * используют их вместо локального стейта, чтобы панель не закрывалась
 * при размонтировании (например, при переключении вкладок проекта).
 *
 * ── API контекста ──
 * - `openThread(task)` — внешнее открытие: сбрасывает стек и показывает один тред.
 *   Используется в TaskListView, BoardsPage, InboxPage, тостах новых сообщений.
 * - `pushThread(task)` — навигация внутри панели: кладёт тред поверх стека.
 *   Используется компонентами, которые рендерятся ВНУТРИ открытой панели
 *   (например, список тредов проекта), чтобы переход между тредами не стирал историю.
 * - `closeThread()` — крестик: полностью закрывает панель (сбрасывает стек).
 * - `isInsidePanel` — флаг контекста: true, если текущее React-дерево находится
 *   внутри TaskPanel. Вложенный TaskListView смотрит в этот флаг и по клику
 *   вызывает `pushThread` вместо `openThread` — так работает «стек навигации».
 */

import { createContext, useContext } from 'react'
import type { TaskItem } from './types'

interface TaskPanelContextValue {
  openThread: (task: TaskItem) => void
  pushThread: (task: TaskItem) => void
  closeThread: () => void
  /** true, если дерево рендерится внутри открытой TaskPanel */
  isInsidePanel?: boolean
}

export const TaskPanelContext = createContext<TaskPanelContextValue | null>(null)

export function useLayoutTaskPanel() {
  return useContext(TaskPanelContext)
}

/**
 * Глобальный ref для открытия TaskPanel из хуков вне React-дерева
 * (например, из useNewMessageToast). Внешнее открытие — поэтому
 * маппится на `openThread` (replace-семантика), а не на push.
 */
let _globalOpenThread: ((task: TaskItem) => void) | null = null

export function setGlobalOpenThread(fn: ((task: TaskItem) => void) | null) {
  _globalOpenThread = fn
}

export function globalOpenThread(task: TaskItem) {
  _globalOpenThread?.(task)
}

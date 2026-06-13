"use client"

/**
 * useStandaloneTabs — in-memory вкладки для standalone-режима боковой панели
 * (personal dialogs без project_id и без contact_participant_id).
 *
 * В отличие от useTaskPanelTabs, состояние НЕ персистится в БД — живёт только
 * в текущей сессии панели. При закрытии панели или открытии другого треда
 * standalone-вкладки сбрасываются.
 *
 * Используется для тредов с внешним собеседником (TG Business / MTProto /
 * Wazzup личный), у которого нет записи в `participants`. Позволяет открыть
 * рядом с диалогом ассистента, KB-статью, историю и т.п.
 */

import { useCallback, useMemo, useState } from 'react'
import type { TaskPanelTab } from '@/types/taskPanelTabs'

export type StandaloneTabsApi = {
  tabs: TaskPanelTab[]
  activeTabId: string | null
  activeTab: TaskPanelTab | null
  openTab: (tab: TaskPanelTab) => void
  closeTab: (id: string) => void
  activateTab: (id: string | null) => void
  reorderTab: (activeId: string, overId: string | null, pinned: boolean) => void
  togglePin: (id: string) => void
  /** Полный сброс state — для перехода на не-standalone scope. */
  reset: () => void
  /** Засеять стартовый набор вкладок (обычно — один тред-таб). */
  seed: (tabs: TaskPanelTab[], activeId?: string | null) => void
}

export function useStandaloneTabs(): StandaloneTabsApi {
  const [tabs, setTabs] = useState<TaskPanelTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  )

  const openTab = useCallback((tab: TaskPanelTab) => {
    setTabs((prev) => {
      if (prev.some((t) => t.id === tab.id)) return prev
      return [...prev, tab]
    })
    setActiveTabId(tab.id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      if (idx === -1) return prev
      const next = prev.filter((t) => t.id !== id)
      // Если закрыли активную — переключаемся на соседнюю (правую, иначе левую).
      setActiveTabId((curr) => {
        if (curr !== id) return curr
        const neighbour = next[idx] ?? next[idx - 1] ?? null
        return neighbour?.id ?? null
      })
      return next
    })
  }, [])

  const activateTab = useCallback((id: string | null) => {
    setActiveTabId(id)
  }, [])

  const reorderTab = useCallback(
    (activeId: string, overId: string | null, _pinned: boolean) => {
      setTabs((prev) => {
        const activeIdx = prev.findIndex((t) => t.id === activeId)
        if (activeIdx === -1) return prev
        const next = [...prev]
        const [moved] = next.splice(activeIdx, 1)
        if (overId === null) {
          next.push(moved)
        } else {
          const overIdx = next.findIndex((t) => t.id === overId)
          if (overIdx === -1) next.push(moved)
          else next.splice(overIdx, 0, moved)
        }
        return next
      })
    },
    [],
  )

  const togglePin = useCallback((id: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)),
    )
  }, [])

  const reset = useCallback(() => {
    setTabs([])
    setActiveTabId(null)
  }, [])

  const seed = useCallback((seedTabs: TaskPanelTab[], activeId?: string | null) => {
    setTabs(seedTabs)
    setActiveTabId(activeId ?? seedTabs[0]?.id ?? null)
  }, [])

  return {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    closeTab,
    activateTab,
    reorderTab,
    togglePin,
    reset,
    seed,
  }
}

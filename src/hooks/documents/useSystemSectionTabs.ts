"use client"

/**
 * Хук для управления вкладками SystemSection
 * Инкапсулирует логику переключения с анимацией
 */

import { useCallback, useEffect, useRef } from 'react'
import type { SystemSectionTab } from '@/components/documents/types'

// Задержка для анимации закрытия секции
const TAB_SWITCH_DELAY = 150

interface UseSystemSectionTabsProps {
  activeTab: SystemSectionTab
  unassignedCollapsed: boolean
  sourceCollapsed: boolean
  destinationCollapsed: boolean
  trashCollapsed: boolean
  onTabChange: (tab: SystemSectionTab) => void
  onUnassignedCollapsedChange: (collapsed: boolean) => void
  onSourceCollapsedChange: (collapsed: boolean) => void
  onDestinationCollapsedChange: (collapsed: boolean) => void
  onTrashCollapsedChange: (collapsed: boolean) => void
}

export function useSystemSectionTabs({
  activeTab,
  unassignedCollapsed,
  sourceCollapsed,
  destinationCollapsed,
  trashCollapsed,
  onTabChange,
  onUnassignedCollapsedChange,
  onSourceCollapsedChange,
  onDestinationCollapsedChange,
  onTrashCollapsedChange,
}: UseSystemSectionTabsProps) {
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Очистка таймера при unmount
  useEffect(() => {
    return () => {
      if (switchTimerRef.current) {
        clearTimeout(switchTimerRef.current)
      }
    }
  }, [])

  // Сворачивает текущую активную вкладку
  const collapseCurrentTab = useCallback(() => {
    switch (activeTab) {
      case 'unassigned':
        onUnassignedCollapsedChange(true)
        break
      case 'source':
        onSourceCollapsedChange(true)
        break
      case 'destination':
        onDestinationCollapsedChange(true)
        break
      case 'trash':
        onTrashCollapsedChange(true)
        break
    }
  }, [activeTab, onUnassignedCollapsedChange, onSourceCollapsedChange, onDestinationCollapsedChange, onTrashCollapsedChange])

  // Переключение на вкладку с анимацией
  const switchToTab = useCallback((
    targetTab: SystemSectionTab,
    expandCallback: (collapsed: boolean) => void
  ) => {
    if (switchTimerRef.current) {
      clearTimeout(switchTimerRef.current)
    }
    collapseCurrentTab()
    switchTimerRef.current = setTimeout(() => {
      switchTimerRef.current = null
      onTabChange(targetTab)
      expandCallback(false)
    }, TAB_SWITCH_DELAY)
  }, [collapseCurrentTab, onTabChange])

  // Обработчик клика на "Нераспределённые"
  const handleUnassignedClick = useCallback(() => {
    if (activeTab === 'unassigned') {
      onUnassignedCollapsedChange(!unassignedCollapsed)
    } else {
      switchToTab('unassigned', onUnassignedCollapsedChange)
    }
  }, [activeTab, unassignedCollapsed, onUnassignedCollapsedChange, switchToTab])

  // Обработчик клика на "Источник"
  const handleSourceClick = useCallback(() => {
    if (activeTab === 'source') {
      onSourceCollapsedChange(!sourceCollapsed)
    } else {
      switchToTab('source', onSourceCollapsedChange)
    }
  }, [activeTab, sourceCollapsed, onSourceCollapsedChange, switchToTab])

  // Обработчик клика на "Папка назначения"
  const handleDestinationClick = useCallback(() => {
    if (activeTab === 'destination') {
      onDestinationCollapsedChange(!destinationCollapsed)
    } else {
      switchToTab('destination', onDestinationCollapsedChange)
    }
  }, [activeTab, destinationCollapsed, onDestinationCollapsedChange, switchToTab])

  // Обработчик клика на "Корзина"
  const handleTrashClick = useCallback(() => {
    if (activeTab === 'trash') {
      onTrashCollapsedChange(!trashCollapsed)
    } else {
      switchToTab('trash', onTrashCollapsedChange)
    }
  }, [activeTab, trashCollapsed, onTrashCollapsedChange, switchToTab])

  return {
    handleUnassignedClick,
    handleSourceClick,
    handleDestinationClick,
    handleTrashClick,
  }
}

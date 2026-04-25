"use client"

/**
 * SystemSectionContainer — системная секция с вкладками
 *
 * Вкладки: Нераспределённые (Загруженные + Из источника), Экспорт, Корзина
 */

import { memo, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Upload, Download, ExternalLink, Inbox, FolderUp, Trash2, Settings } from 'lucide-react'
import { DestinationSection, TrashSection } from '@/components/documents/sections'
import type { SystemSectionTab } from '@/components/documents/types'
import { useDocumentKitContext } from '../context'
import { UnassignedTabContent } from './UnassignedTabContent'

export const SystemSectionContainer = memo(function SystemSectionContainer() {
  const { data, uiState, handlers } = useDocumentKitContext()

  const { ungroupedDocuments, sourceDocuments, destinationDocuments, trashedDocuments } = data
  const {
    activeTab,
    unassignedCollapsed,
    destinationCollapsed,
    trashCollapsed,
    selectedDocuments,
    hasSelection,
    hoveredDocumentId,
    isExporting,
    isFetchingDestination,
    hasExported,
    exportPhase = 'idle',
  } = uiState

  // Маппинг вкладок на обработчики свёрнутости.
  // 'source' не имеет собственного collapsed-состояния и ведёт себя как 'unassigned',
  // поэтому используем тип CollapsibleTab = подмножество SystemSectionTab без 'source'.
  type CollapsibleTab = Exclude<SystemSectionTab, 'source'>

  const collapseHandlers: Record<CollapsibleTab, (collapsed: boolean) => void> = {
    unassigned: handlers.onUnassignedCollapsedChange,
    destination: handlers.onDestinationCollapsedChange,
    trash: handlers.onTrashCollapsedChange,
  }

  const collapsedStates: Record<CollapsibleTab, boolean> = {
    unassigned: unassignedCollapsed,
    destination: destinationCollapsed,
    trash: trashCollapsed,
  }

  // Нормализуем 'source' к 'unassigned' для collapse-операций
  const toCollapsibleTab = (t: SystemSectionTab): CollapsibleTab =>
    t === 'source' ? 'unassigned' : t

  // Cleanup таймера при unmount
  const tabSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (tabSwitchTimerRef.current) clearTimeout(tabSwitchTimerRef.current)
    }
  }, [])

  const handleTabClick = (tab: SystemSectionTab) => {
    const tabKey = toCollapsibleTab(tab)
    const activeKey = toCollapsibleTab(activeTab)
    if (activeTab === tab) {
      collapseHandlers[tabKey](!collapsedStates[tabKey])
    } else {
      collapseHandlers[activeKey](true)
      if (tabSwitchTimerRef.current) clearTimeout(tabSwitchTimerRef.current)
      tabSwitchTimerRef.current = setTimeout(
        () => {
          handlers.onTabChange(tab)
          collapseHandlers[tabKey](false)
        },
        tab === 'unassigned' ? 100 : 150,
      )
    }
  }

  return (
    <div className="overflow-visible">
      <Tabs value={activeTab}>
        {/* Шапка: табы + панель действий */}
        <div className="px-2 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-1 h-9">
            <TabButton
              tab="unassigned"
              activeTab={activeTab}
              onClick={handleTabClick}
              icon={<Inbox className="h-3.5 w-3.5" />}
              label="Нераспределённые"
              count={ungroupedDocuments.length + sourceDocuments.length}
              activeColor="blue"
            />
            <TabButton
              tab="destination"
              activeTab={activeTab}
              onClick={handleTabClick}
              icon={<FolderUp className="h-3.5 w-3.5" />}
              label="Экспорт"
              count={destinationDocuments.length}
              activeColor="green"
            />
            <TabButton
              tab="trash"
              activeTab={activeTab}
              onClick={handleTabClick}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Корзина"
              count={trashedDocuments.length}
              activeColor="red"
            />
          </div>

          {/* Панель действий для Экспорт */}
          {activeTab === 'destination' && !destinationCollapsed && (
            <div className="flex items-center gap-2.5 mt-2 px-0.5">
              <button
                type="button"
                onClick={() => {
                  if (!isExporting) handlers.onExportToDestination()
                }}
                disabled={isExporting}
                className={`flex items-center gap-1 text-[11px] text-green-500 hover:text-green-700 transition-colors ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Upload className="h-3 w-3" />В Drive
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isFetchingDestination) handlers.onFetchDestination()
                }}
                disabled={isFetchingDestination}
                className={`flex items-center gap-1 text-[11px] text-green-500 hover:text-green-700 transition-colors ${isFetchingDestination ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Download className="h-3 w-3" />
                Состав
              </button>
              <button
                type="button"
                onClick={() => handlers.onOpenDestinationInDrive()}
                className="flex items-center gap-1 text-[11px] text-green-500 hover:text-green-700 transition-colors"
                title="Открыть в Google Drive"
              >
                <ExternalLink className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handlers.onOpenDestinationSettings()}
                className="flex items-center gap-1 text-[11px] text-green-500 hover:text-green-700 transition-colors"
                title="Настройки"
              >
                <Settings className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <TabsContent value="unassigned" className="m-0">
          <UnassignedTabContent />
        </TabsContent>

        <TabsContent value="destination" className="m-0">
          <DestinationSection
            documents={destinationDocuments}
            isCollapsed={destinationCollapsed}
            isExporting={isExporting}
            isFetchingDestination={isFetchingDestination}
            hasExported={hasExported}
            exportPhase={exportPhase}
          />
        </TabsContent>

        <TabsContent value="trash" className="m-0">
          <TrashSection
            documents={trashedDocuments}
            isCollapsed={trashCollapsed}
            selectedDocuments={selectedDocuments}
            hasSelection={hasSelection}
            hoveredDocumentId={hoveredDocumentId}
            onSelectDocument={handlers.onSelectDocument}
            onHoverDocument={handlers.onHoverDocument}
            onOpenEditDocument={handlers.onOpenEditDocument}
            onRestoreDocument={handlers.onRestoreDocument}
            onHardDeleteDocument={handlers.onHardDeleteDocument}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
})

// --- Tab Button ---

const COLOR_MAP = {
  blue: { active: 'bg-blue-50 text-blue-600', count: 'text-blue-400' },
  green: { active: 'bg-green-50 text-green-600', count: 'text-green-400' },
  red: { active: 'bg-red-50 text-red-600', count: 'text-red-400' },
} as const

function TabButton({
  tab,
  activeTab,
  onClick,
  icon,
  label,
  count,
  activeColor,
}: {
  tab: SystemSectionTab
  activeTab: SystemSectionTab
  onClick: (tab: SystemSectionTab) => void
  icon: React.ReactNode
  label: string
  count: number
  activeColor: keyof typeof COLOR_MAP
}) {
  const isActive = activeTab === tab
  const colors = COLOR_MAP[activeColor]

  return (
    <button
      type="button"
      onClick={() => onClick(tab)}
      className={cn(
        'text-xs px-2 h-6 rounded-full transition-all flex items-center gap-1',
        isActive
          ? `${colors.active} font-medium shadow-[0_1px_3px_rgba(0,0,0,0.15)] border border-gray-300 ring-1 ring-black/5`
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
      <span className={cn('text-[10px]', isActive ? colors.count : 'text-muted-foreground/50')}>
        {count}
      </span>
    </button>
  )
}

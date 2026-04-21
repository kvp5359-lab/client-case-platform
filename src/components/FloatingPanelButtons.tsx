"use client"

/**
 * Плавающие кнопки для боковой панели:
 * - Группа из четырёх полосок у правого края:
 *   1. >>/<< — открыть/закрыть панель (серая)
 *   2. Чаты — открыть панель на вкладке Чаты (amber)
 *   3. Ассистент — открыть панель на вкладке Ассистент (violet)
 *   4. Дополнительно — открыть панель на вкладке Дополнительно (amber, только в проекте)
 */

import { Sparkles, MessageSquare, FolderCog, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useMemo } from 'react'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { useFilteredInbox } from '@/hooks/messenger/useFilteredInbox'
import { getAggregateBadgeDisplay, formatBadgeCount } from '@/utils/inboxUnread'
import { useWorkspacePermissions, useProjectPermissions } from '@/hooks/permissions'
import { cn } from '@/lib/utils'

export function FloatingPanelButtons() {
  const panelTab = useSidePanelStore((s) => s.panelTab)
  const lastPanelTab = useSidePanelStore((s) => s.lastPanelTab)
  const pageContext = useSidePanelStore((s) => s.pageContext)
  const messengerEnabled = useSidePanelStore((s) => s.chatsEnabled)
  const togglePanel = useSidePanelStore((s) => s.togglePanel)
  const openPanel = useSidePanelStore((s) => s.openPanel)
  const closePanel = useSidePanelStore((s) => s.closePanel)

  const { isClientOnly } = useWorkspacePermissions()

  const panelOpen = panelTab !== null

  const hasProject = !!pageContext.projectId
  const showMessenger = hasProject && messengerEnabled
  const { data: inboxThreads = [] } = useFilteredInbox(pageContext.workspaceId ?? '')
  const projectBadge = useMemo(() => {
    if (!pageContext.projectId) return { type: 'none' as const }
    return getAggregateBadgeDisplay(
      inboxThreads.filter((t) => t.project_id === pageContext.projectId),
    )
  }, [inboxThreads, pageContext.projectId])

  const { hasModuleAccess } = useProjectPermissions({ projectId: pageContext.projectId ?? '' })
  const showAi =
    !hasProject ||
    hasModuleAccess('ai_knowledge_all') ||
    hasModuleAccess('ai_knowledge_project') ||
    hasModuleAccess('ai_project_assistant')

  const showExtra = hasProject && !isClientOnly
  const hasAnyTab = showMessenger || showAi || showExtra
  const isChatsActive = panelOpen && (panelTab === 'client' || panelTab === 'internal')
  const isAssistantActive = panelOpen && panelTab === 'assistant'
  const isExtraActive = panelOpen && panelTab === 'extra'

  if (!hasAnyTab && !panelOpen) return null

  /** Общий стиль полоски */
  const stripBase = cn(
    'relative w-7 rounded-l-md',
    'border-2 border-r-0',
    'flex items-center justify-center',
    'transition-[background-color,color,border-color] duration-150',
    'shadow-sm',
  )

  return (
    <TooltipProvider>
      <div
        style={
          !panelOpen
            ? {
                animation: 'panel-tab-slide-in 300ms ease-out forwards',
                transform: 'translateX(100%)',
              }
            : undefined
        }
        className="absolute right-0 top-[6px] z-40 flex flex-col gap-px"
      >
        {/* 1. Открыть / закрыть панель */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => (panelOpen ? closePanel() : openPanel(lastPanelTab))}
              aria-label={panelOpen ? 'Закрыть панель' : 'Открыть панель'}
              className={cn(
                stripBase,
                'h-10',
                'bg-white border-gray-200 text-gray-400',
                'hover:bg-gray-50 hover:text-gray-600',
              )}
            >
              {panelOpen ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <ChevronsLeft className="h-4 w-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {panelOpen ? 'Закрыть панель' : 'Открыть панель'}
          </TooltipContent>
        </Tooltip>

        {/* 2. Чаты */}
        {!panelOpen && showMessenger && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => togglePanel('client')}
                aria-label="Чаты"
                className={cn(
                  stripBase,
                  'h-9',
                  isChatsActive
                    ? 'bg-blue-50 border-blue-300 text-blue-600'
                    : 'bg-white border-blue-200 text-blue-500 hover:bg-blue-50 hover:border-blue-300',
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {projectBadge.type === 'number' && (
                  <span className="absolute -left-1 -top-1 h-4 min-w-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {formatBadgeCount(projectBadge.value)}
                  </span>
                )}
                {projectBadge.type === 'emoji' && (
                  <span className="absolute -left-1 -top-1 h-4 min-w-4 px-1 rounded-full bg-blue-100 text-[10px] flex items-center justify-center">
                    {projectBadge.value}
                  </span>
                )}
                {projectBadge.type === 'dot' && (
                  <span className="absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue-500" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">Чаты</TooltipContent>
          </Tooltip>
        )}

        {/* 3. Ассистент */}
        {!panelOpen && showAi && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => togglePanel('assistant')}
                aria-label="Ассистент"
                className={cn(
                  stripBase,
                  'h-9',
                  isAssistantActive
                    ? 'bg-violet-50 border-violet-300 text-violet-600'
                    : 'bg-white border-violet-200 text-violet-500 hover:bg-violet-50 hover:border-violet-300',
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">Ассистент</TooltipContent>
          </Tooltip>
        )}

        {/* 4. Дополнительно — только в проекте, только когда панель закрыта */}
        {!panelOpen && hasProject && !isClientOnly && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => togglePanel('extra')}
                aria-label="Дополнительно"
                className={cn(
                  stripBase,
                  'h-9',
                  isExtraActive
                    ? 'bg-amber-50 border-amber-300 text-amber-600'
                    : 'bg-white border-amber-200 text-amber-500 hover:bg-amber-50 hover:border-amber-300',
                )}
              >
                <FolderCog className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">Дополнительно</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

/**
 * PanelTabs — верхний ряд вкладок боковой панели: Чаты / Ассистент / Дополнительно
 *
 * Extracted from WorkspaceLayout.tsx (Z5-22)
 */

import { MessageSquare, Sparkles, FolderCog, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PanelTab } from '@/store/sidePanelStore'
import { useFilteredInbox } from '@/hooks/messenger/useFilteredInbox'
import { calcTotalUnread } from '@/utils/inboxUnread'

interface PanelTabsProps {
  activeTab: PanelTab
  onTabChange: (tab: PanelTab) => void
  showMessenger: boolean
  showAssistant: boolean
  showExtra?: boolean
  projectId?: string
  workspaceId?: string
}

interface PanelTabButtonProps {
  label: string
  icon: LucideIcon
  isActive: boolean
  activeClassName: string
  onClick: () => void
  badge?: React.ReactNode
}

function PanelTabButton({
  label,
  icon: Icon,
  isActive,
  activeClassName,
  onClick,
  badge,
}: PanelTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-sm px-3 py-1 rounded-full transition-all flex items-center gap-1.5',
        isActive
          ? cn(activeClassName, 'font-medium shadow-[0_1px_3px_rgba(0,0,0,0.3)]')
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {badge}
    </button>
  )
}

/**
 * TODO (Z1-04/Z1-05): Replace buttons with role="tablist" / role="tab" for tab semantics
 */
export function PanelTabs({
  activeTab,
  onTabChange,
  showMessenger,
  showAssistant,
  showExtra,
  projectId,
  workspaceId,
}: PanelTabsProps) {
  const { data: inboxThreads = [] } = useFilteredInbox(workspaceId ?? '')

  // Count unread only for this project (already access-filtered)
  const totalUnread = calcTotalUnread(inboxThreads.filter((t) => t.project_id === projectId))
  const isChatsActive = activeTab === 'client' || activeTab === 'internal'

  return (
    <div className="flex items-center gap-1 bg-muted rounded-full p-1">
      {showMessenger && (
        <PanelTabButton
          label="Чаты"
          icon={MessageSquare}
          isActive={isChatsActive}
          activeClassName="bg-blue-50 text-blue-700"
          onClick={() => onTabChange('client')}
          badge={
            totalUnread > 0 ? (
              <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[11px] font-medium flex items-center justify-center">
                {totalUnread}
              </span>
            ) : undefined
          }
        />
      )}
      {showAssistant && (
        <PanelTabButton
          label="Ассистент"
          icon={Sparkles}
          isActive={activeTab === 'assistant'}
          activeClassName="bg-violet-50 text-violet-600"
          onClick={() => onTabChange('assistant')}
        />
      )}
      {showExtra && projectId && (
        <PanelTabButton
          label="Дополнительно"
          icon={FolderCog}
          isActive={activeTab === 'extra'}
          activeClassName="bg-amber-50 text-amber-700"
          onClick={() => onTabChange('extra')}
        />
      )}
    </div>
  )
}

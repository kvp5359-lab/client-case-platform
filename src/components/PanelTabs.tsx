/**
 * PanelTabs — верхний ряд вкладок боковой панели: Чаты / Ассистент / Дополнительно
 *
 * Extracted from WorkspaceLayout.tsx
 */

import { MessageSquare, Sparkles, FolderCog, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PanelTab } from '@/store/sidePanelStore'
import { useFilteredInbox } from '@/hooks/messenger/useFilteredInbox'
import { getAggregateBadgeDisplay, formatBadgeCount, calcThreadUnread } from '@/utils/inboxUnread'
import { BADGE_COLOR_CLASSES } from '@/components/WorkspaceSidebar/projectListConstants'

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
  tabId: string
}

function PanelTabButton({
  label,
  icon: Icon,
  isActive,
  activeClassName,
  onClick,
  badge,
  tabId,
}: PanelTabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      id={`panel-tab-${tabId}`}
      aria-selected={isActive}
      aria-controls={`panel-tabpanel-${tabId}`}
      tabIndex={isActive ? 0 : -1}
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

  // Единая логика бейджа для проекта через центральную функцию
  const projectThreads = inboxThreads.filter((t) => t.project_id === projectId)
  const chatsBadge = getAggregateBadgeDisplay(projectThreads)

  // Цвет бейджа — accent_color треда с непрочитанными; при разнобое — amber.
  // Та же логика, что в WorkspaceSidebar (useFilteredInbox → badgeColors).
  let badgeAccent: string | undefined
  for (const t of projectThreads) {
    if (calcThreadUnread(t) === 0) continue
    const color = t.thread_accent_color ?? 'blue'
    if (!badgeAccent) badgeAccent = color
    else if (badgeAccent !== color) {
      badgeAccent = 'amber'
      break
    }
  }
  const badgeBg = BADGE_COLOR_CLASSES[badgeAccent ?? 'blue']?.bg ?? BADGE_COLOR_CLASSES.blue.bg
  const isChatsActive = activeTab === 'client' || activeTab === 'internal'

  return (
    <div
      role="tablist"
      aria-label="Разделы боковой панели"
      className="flex items-center gap-1 bg-muted rounded-full p-1"
    >
      {showMessenger && (
        <PanelTabButton
          tabId="chats"
          label="Чаты"
          icon={MessageSquare}
          isActive={isChatsActive}
          activeClassName="bg-blue-50 text-blue-700"
          onClick={() => onTabChange('client')}
          badge={
            chatsBadge.type === 'number' ? (
              <span
                className={cn(
                  'ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[11px] font-medium flex items-center justify-center',
                  badgeBg,
                )}
              >
                {formatBadgeCount(chatsBadge.value)}
              </span>
            ) : chatsBadge.type === 'emoji' ? (
              <span
                className={cn(
                  'ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] flex items-center justify-center leading-none',
                  badgeBg,
                )}
              >
                {chatsBadge.value}
              </span>
            ) : chatsBadge.type === 'dot' ? (
              <span className={cn('ml-0.5 w-2.5 h-2.5 rounded-full', badgeBg)} />
            ) : undefined
          }
        />
      )}
      {showAssistant && (
        <PanelTabButton
          tabId="assistant"
          label="Ассистент"
          icon={Sparkles}
          isActive={activeTab === 'assistant'}
          activeClassName="bg-violet-50 text-violet-600"
          onClick={() => onTabChange('assistant')}
        />
      )}
      {showExtra && projectId && (
        <PanelTabButton
          tabId="extra"
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

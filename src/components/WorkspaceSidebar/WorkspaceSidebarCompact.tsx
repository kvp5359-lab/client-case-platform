"use client"

/**
 * Свёрнутый (compact) вид сайдбара — узкая колонка с иконками.
 * Вынесено из WorkspaceSidebarFull, чтобы corner-case рендер
 * не утяжелял основной файл.
 */

import { PanelLeftOpen } from 'lucide-react'
import { SidebarGlobalSearch } from './SidebarGlobalSearch'
import { SidebarSlotsRow } from './SidebarSlotsRow'
import type { ItemList } from '@/hooks/useItemLists'
import type { SidebarSlot } from '@/lib/sidebarSettings'

type Props = {
  onExpand?: () => void
  workspaceId: string | undefined
  currentWorkspace: { name?: string } | null
  topbarSlots: SidebarSlot[]
  listSlots: SidebarSlot[]
  allBoards: { id: string; name: string }[]
  allItemLists: ItemList[]
  isOwner: boolean
  isClientOnly: boolean
  pathname: string
  buildHref: (path: string) => string
  computeBadge: (slot: SidebarSlot) => unknown
  isNavActive: (slot: SidebarSlot) => boolean
  isNavItemActive: (slot: SidebarSlot) => boolean
  toggleBoardPin: (boardId: string) => void
  toggleListPin: (listId: string) => void
}

export function WorkspaceSidebarCompact({
  onExpand,
  workspaceId,
  currentWorkspace,
  topbarSlots,
  listSlots,
  allBoards,
  allItemLists,
  isOwner,
  isClientOnly,
  pathname,
  buildHref,
  computeBadge,
  isNavActive,
  isNavItemActive,
  toggleBoardPin,
  toggleListPin,
}: Props) {
  const wsName = currentWorkspace?.name ?? ''
  return (
    <aside
      data-workspace-sidebar
      className="relative bg-[#f7f7f7] flex-shrink-0 flex flex-col h-full overflow-hidden border-r border-gray-200 w-12"
    >
      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={onExpand}
          aria-label="Развернуть сайдбар"
          title="Развернуть сайдбар"
          className="flex items-center justify-center h-8 w-8 rounded-md bg-background border shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <PanelLeftOpen size={14} />
        </button>
      </div>
      <div className="flex justify-center pt-2">
        {currentWorkspace && (
          <div
            className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium"
            title={wsName}
          >
            {wsName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex justify-center pt-2">
        <SidebarGlobalSearch workspaceId={workspaceId} compact />
      </div>
      <div className="px-1 pt-1 pb-2 flex flex-col gap-1.5 overflow-y-auto">
        <SidebarSlotsRow
          slots={topbarSlots}
          compact
          direction="column"
          allBoards={allBoards}
          allItemLists={allItemLists}
          isOwner={isOwner}
          pathname={pathname}
          buildHref={buildHref}
          computeBadge={computeBadge}
          isNavActive={isNavActive}
          isNavItemActive={isNavItemActive}
          listSlots={listSlots}
          toggleBoardPin={toggleBoardPin}
          toggleListPin={toggleListPin}
        />
        {!isClientOnly && topbarSlots.length > 0 && listSlots.length > 0 && (
          <div className="mx-2 h-px bg-gray-300/70" />
        )}
        {!isClientOnly && (
          <SidebarSlotsRow
            slots={listSlots}
            compact
            direction="column"
            allBoards={allBoards}
            allItemLists={allItemLists}
            isOwner={isOwner}
            pathname={pathname}
            buildHref={buildHref}
            computeBadge={computeBadge}
            isNavActive={isNavActive}
            isNavItemActive={isNavItemActive}
            listSlots={listSlots}
            toggleBoardPin={toggleBoardPin}
            toggleListPin={toggleListPin}
          />
        )}
      </div>
    </aside>
  )
}

"use client"

/**
 * SidebarSlotsRow — общий рендерер ряда слотов сайдбара (топбар-иконки
 * или полные пункты списка). Один компонент покрывает оба режима через
 * `compact` — раньше эти ~150 строк копипастились двумя `<nav>` блоками
 * внутри WorkspaceSidebarFull.
 */

import { FolderOpen, Kanban, ListChecks, PinOff } from 'lucide-react'
import { SidebarNavButton } from './SidebarNavButton'
import type { ItemList } from '@/hooks/useItemLists'
import {
  SIDEBAR_NAV_ITEMS,
  boardIdFromSlotId,
  listIdFromSlotId,
  navKeyFromSlotId,
  type SidebarBadgeMode,
  type SidebarNavKey,
  type SidebarSlot,
} from '@/lib/sidebarSettings'

interface SidebarSlotsRowProps {
  slots: SidebarSlot[]
  compact: boolean
  allBoards: { id: string; name: string }[] | undefined
  allItemLists: ItemList[] | undefined
  isOwner: boolean
  pathname: string
  buildHref: (path: string) => string
  computeBadge: (mode: SidebarBadgeMode) => string | undefined
  isNavActive: (href: string) => boolean
  isNavItemActive: (key: SidebarNavKey, listSlots: SidebarSlot[]) => boolean
  /** Контекст «list-slots» для isNavItemActive — нужен ему для приоритета overlap'ов. */
  listSlots: SidebarSlot[]
  toggleBoardPin: (boardId: string) => void
  toggleListPin: (listId: string) => void
}

export function SidebarSlotsRow({
  slots,
  compact,
  allBoards,
  allItemLists,
  isOwner,
  pathname,
  buildHref,
  computeBadge,
  isNavActive,
  isNavItemActive,
  listSlots,
  toggleBoardPin,
  toggleListPin,
}: SidebarSlotsRowProps) {
  if (slots.length === 0) return null

  const wrapperClass = compact
    ? 'flex items-center justify-between gap-[1px]'
    : ''
  const wrapperStyle = compact
    ? undefined
    : { display: 'flex', flexDirection: 'column' as const, gap: '1px' }

  return (
    <nav className={wrapperClass} style={wrapperStyle}>
      {slots.map((slot) => {
        const badge = computeBadge(slot.badge_mode)

        if (slot.type === 'nav') {
          const key = navKeyFromSlotId(slot.id)!
          const meta = SIDEBAR_NAV_ITEMS[key]
          return (
            <SidebarNavButton
              key={slot.id}
              icon={meta.icon}
              label={meta.label}
              href={buildHref(meta.path)}
              badge={badge}
              isActive={isNavItemActive(key, listSlots)}
              compact={compact || undefined}
            />
          )
        }

        if (slot.type === 'board') {
          const boardId = boardIdFromSlotId(slot.id)!
          const board = allBoards?.find((b) => b.id === boardId)
          if (!board) return null
          // Pin-off hover-хэндл показываем только в «полном» режиме (compact-
          // иконки в топбаре слишком маленькие, а для них pin-off дублирует
          // × в настройках сайдбара).
          const hoverSlot =
            !compact && isOwner ? (
              <button
                type="button"
                className="p-0.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200/60"
                title="Открепить"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleBoardPin(board.id)
                }}
              >
                <PinOff className="h-[14px] w-[14px]" />
              </button>
            ) : undefined
          const button = (
            <SidebarNavButton
              icon={Kanban}
              label={board.name}
              href={buildHref(`boards/${board.id}`)}
              badge={badge}
              isActive={isNavActive('boards') && pathname.includes(`/boards/${board.id}`)}
              compact={compact || undefined}
              hoverIconSlot={hoverSlot}
            />
          )
          return compact ? (
            <div key={slot.id}>{button}</div>
          ) : (
            <div key={slot.id} className="group/pin">
              {button}
            </div>
          )
        }

        // type === 'list'
        const listId = listIdFromSlotId(slot.id)!
        const list = allItemLists?.find((l) => l.id === listId)
        if (!list) return null
        const hoverSlot =
          !compact && isOwner ? (
            <button
              type="button"
              className="p-0.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200/60"
              title="Открепить"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                toggleListPin(list.id)
              }}
            >
              <PinOff className="h-[14px] w-[14px]" />
            </button>
          ) : undefined
        const Icon = list.entity_type === 'project' ? FolderOpen : ListChecks
        const button = (
          <SidebarNavButton
            icon={Icon}
            label={list.name}
            href={buildHref(`lists/${list.id}`)}
            badge={badge}
            isActive={pathname.includes(`/lists/${list.id}`)}
            compact={compact || undefined}
            hoverIconSlot={hoverSlot}
          />
        )
        return compact ? (
          <div key={slot.id}>{button}</div>
        ) : (
          <div key={slot.id} className="group/pin">
            {button}
          </div>
        )
      })}
    </nav>
  )
}

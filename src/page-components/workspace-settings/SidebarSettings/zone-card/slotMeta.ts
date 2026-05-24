/**
 * Резолв «метаданных» слота сайдбара (название + иконка) по типу
 * и привязке к доске/списку/папке.
 */

import {
  Folder as FolderIcon,
  FolderOpen,
  Kanban,
  ListChecks,
  type LucideIcon,
} from 'lucide-react'
import type { ItemList } from '@/hooks/useItemLists'
import {
  boardIdFromSlotId,
  listIdFromSlotId,
  navKeyFromSlotId,
  SIDEBAR_NAV_ITEMS,
  type SidebarSlot,
} from '@/lib/sidebarSettings'

export type SlotMeta = {
  label: string
  Icon: LucideIcon
}

export function resolveSlotMeta(
  slot: SidebarSlot,
  boards: { id: string; name: string }[],
  itemLists: ItemList[],
): SlotMeta {
  if (slot.type === 'nav') {
    const k = navKeyFromSlotId(slot.id)!
    return { label: SIDEBAR_NAV_ITEMS[k].label, Icon: SIDEBAR_NAV_ITEMS[k].icon }
  }
  if (slot.type === 'board') {
    const board = boards.find((b) => b.id === boardIdFromSlotId(slot.id))
    return { label: board?.name ?? '— удалённая доска —', Icon: Kanban }
  }
  if (slot.type === 'list') {
    const list = itemLists.find((l) => l.id === listIdFromSlotId(slot.id))
    return {
      label: list?.name ?? '— удалённый список —',
      Icon: list?.entity_type === 'project' ? FolderOpen : ListChecks,
    }
  }
  // folder
  return { label: slot.name ?? 'Папка', Icon: FolderIcon }
}

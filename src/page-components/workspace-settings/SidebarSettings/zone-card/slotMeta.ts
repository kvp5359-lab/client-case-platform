/**
 * Резолв «метаданных» слота сайдбара (название + иконка) по типу
 * и привязке к доске/списку/папке.
 */

import {
  Folder as FolderIcon,
  FolderOpen,
  FolderTree,
  Kanban,
  ListChecks,
  type LucideIcon,
} from 'lucide-react'
import type { ItemList } from '@/hooks/useItemLists'
import {
  boardIdFromSlotId,
  listIdFromSlotId,
  sectionIdFromSlotId,
  navKeyFromSlotId,
  slotRef,
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
  sections: { id: string; name: string }[] = [],
): SlotMeta {
  const ref = slotRef(slot)
  if (slot.type === 'nav') {
    const k = navKeyFromSlotId(ref)!
    return { label: SIDEBAR_NAV_ITEMS[k].label, Icon: SIDEBAR_NAV_ITEMS[k].icon }
  }
  if (slot.type === 'board') {
    const board = boards.find((b) => b.id === boardIdFromSlotId(ref))
    return { label: board?.name ?? '— удалённая доска —', Icon: Kanban }
  }
  if (slot.type === 'list') {
    const list = itemLists.find((l) => l.id === listIdFromSlotId(ref))
    return {
      label: list?.name ?? '— удалённый список —',
      Icon: list?.entity_type === 'project' ? FolderOpen : ListChecks,
    }
  }
  if (slot.type === 'section') {
    const section = sections.find((s) => s.id === sectionIdFromSlotId(ref))
    return { label: section?.name ?? '— удалённый раздел —', Icon: FolderTree }
  }
  // folder
  return { label: slot.name ?? 'Папка', Icon: FolderIcon }
}

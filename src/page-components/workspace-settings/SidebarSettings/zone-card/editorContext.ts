/**
 * Общий контекст данных для частей WYSIWYG-редактора сайдбара
 * (`SidebarEditorCanvas` и вынесенные под-компоненты `EditorParts`).
 */

import type { ItemList } from '@/hooks/useItemLists'
import {
  quickActionIdFromSlotId,
  slotRef,
  type SidebarSlot,
} from '@/lib/sidebarSettings'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import type { QuickAction } from '@/types/quickActions'
import { resolveSlotMeta, type SlotMeta } from './slotMeta'

export type DataCtx = {
  boards: { id: string; name: string }[]
  itemLists: ItemList[]
  sections: { id: string; name: string }[]
  quickActions: QuickAction[]
}

/** Мета слота с учётом quickaction (иконка/имя из активного профиля). */
export function metaFor(slot: SidebarSlot, data: DataCtx): SlotMeta {
  if (slot.type === 'quickaction') {
    const aid = quickActionIdFromSlotId(slotRef(slot))
    const a = data.quickActions.find((x) => x.id === aid)
    return { label: a?.label ?? 'Действие', Icon: getChatIconComponent(a?.icon ?? 'message-square') }
  }
  if (slot.type === 'link') {
    return { label: slot.name?.trim() || 'Ссылка', Icon: getChatIconComponent(slot.link_icon ?? 'globe') }
  }
  if (slot.type === 'folder' && slot.folder_icon) {
    return { label: slot.name?.trim() || 'Папка', Icon: getChatIconComponent(slot.folder_icon) }
  }
  return resolveSlotMeta(slot, data.boards, data.itemLists, data.sections)
}

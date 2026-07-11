/**
 * Общий адаптер дерева базы знаний. Одно и то же дерево (иерархия групп +
 * DnD + строки) рендерит и статьи, и Q&A — различие только в реализации
 * TreeSource (данные, мутации, рендер строки).
 */

import type { ReactNode } from 'react'
import type { KbAccessMode } from '@/components/knowledge/template-access/helpers'

export type TreeGroupData = {
  id: string
  name: string
  color: string | null
  parent_id: string | null
  sort_order: number
  template_access_mode: KbAccessMode
}

export type DropPosition = 'top' | 'bottom'

export type DropIndicatorState = {
  itemId: string
  position: DropPosition
}

export type TreeSource<Item extends { id: string }> = {
  workspaceId: string

  // ── Данные ──
  groups: TreeGroupData[]
  items: Item[]
  getItemGroupId: (itemId: string) => string | null
  getItemsForGroup: (groupId: string) => Item[]
  ungroupedItems: Item[]

  // ── DnD-мутации ──
  moveItemToGroup: (
    a: {
      itemId: string
      fromGroupId: string | null
      toGroupId: string | null
    },
    opts?: { onSuccess?: () => void },
  ) => void
  reorderItems: (a: { groupId: string; itemIds: string[] }) => void

  // ── CRUD групп (общий knowledge_groups) ──
  addingGroupParentId: string | null
  setAddingGroupParentId: (id: string | null) => void
  newGroupName: string
  setNewGroupName: (v: string) => void
  onCreateGroup: () => void
  createGroupPending: boolean
  onEditGroup: (g: TreeGroupData) => void
  onDeleteGroup: (g: TreeGroupData) => void
  onAddItem: (groupId: string) => void
  addItemTitle: string

  // ── Рендер ──
  renderItemRow: (ctx: {
    item: Item
    depth: number
    isLast: boolean
    dropPosition: DropPosition | null
  }) => ReactNode
  renderDragOverlay: (item: Item) => ReactNode

  // ── Фильтр/поиск ──
  filterChildren?: (groupId: string) => boolean
  isSearchActive: boolean
}

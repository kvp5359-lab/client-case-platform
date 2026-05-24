"use client"

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  FolderPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ItemList } from '@/hooks/useItemLists'
import {
  childrenOfFolder,
  topLevelSlots,
  type SidebarBadgeColor,
  type SidebarBadgeMode,
  type SidebarPlacement,
  type SidebarSlot,
} from '@/lib/sidebarSettings'
import { SlotRow } from './zone-card/SlotRow'
import { FolderRow } from './zone-card/FolderRow'
import { resolveSlotMeta } from './zone-card/slotMeta'

type ZoneCardProps = {
  title: string
  description: string
  emptyHint: string
  /** Все слоты — компонент сам отфильтрует по placement и вытащит верхний уровень. */
  slots: SidebarSlot[]
  boards: { id: string; name: string }[]
  itemLists: ItemList[]
  zone: SidebarPlacement
  onMove: (id: string, delta: -1 | 1) => void
  onSetBadge: (id: string, mode: SidebarBadgeMode) => void
  onSetBadgeColor: (id: string, color: SidebarBadgeColor) => void
  onMoveToZone: (id: string, placement: SidebarPlacement) => void
  onRemove: (id: string) => void
  onCreateFolder: (placement: SidebarPlacement) => void
  onRenameFolder: (slotId: string, name: string) => void
  onMoveToFolder: (slotId: string, folderId: string | null) => void
  warning: string | null
}

export function ZoneCard({
  title,
  description,
  emptyHint,
  slots: allSlots,
  boards,
  itemLists,
  zone,
  onMove,
  onSetBadge,
  onSetBadgeColor,
  onMoveToZone,
  onRemove,
  onCreateFolder,
  onRenameFolder,
  onMoveToFolder,
  warning,
}: ZoneCardProps) {
  const otherZone: SidebarPlacement = zone === 'topbar' ? 'list' : 'topbar'
  const otherZoneLabel = otherZone === 'topbar' ? 'в верх' : 'в список'
  const OtherZoneIcon = otherZone === 'topbar' ? ArrowUp : ArrowDown

  // Слоты этой зоны в их текущем порядке.
  const inZone = allSlots.filter((s) => s.placement === zone)
  const topLevel = topLevelSlots(inZone)
  const folders = inZone.filter((s) => s.type === 'folder')

  // Для перемещения в папку: список папок этой зоны.
  const folderOptions = folders.map((f) => ({ id: f.id, name: f.name ?? 'Папка' }))

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 shrink-0"
          onClick={() => onCreateFolder(zone)}
        >
          <FolderPlus className="w-3.5 h-3.5" />
          Папка
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {warning && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>{warning}</div>
          </div>
        )}

        {topLevel.length === 0 ? (
          <div className="text-sm text-gray-500 rounded-md border border-dashed border-gray-300 px-3 py-4 text-center">
            {emptyHint}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {topLevel.map((slot, idx) => {
              const canUp = idx > 0
              const canDown = idx < topLevel.length - 1
              if (slot.type === 'folder') {
                return (
                  <FolderRow
                    key={slot.id}
                    folder={slot}
                    canUp={canUp}
                    canDown={canDown}
                    children_={childrenOfFolder(inZone, slot.id)}
                    boards={boards}
                    itemLists={itemLists}
                    otherZone={otherZone}
                    otherZoneLabel={otherZoneLabel}
                    OtherZoneIcon={OtherZoneIcon}
                    folderOptions={folderOptions}
                    onMove={onMove}
                    onSetBadge={onSetBadge}
                    onSetBadgeColor={onSetBadgeColor}
                    onMoveToZone={onMoveToZone}
                    onRemove={onRemove}
                    onRenameFolder={onRenameFolder}
                    onMoveToFolder={onMoveToFolder}
                  />
                )
              }
              return (
                <SlotRow
                  key={slot.id}
                  slot={slot}
                  canUp={canUp}
                  canDown={canDown}
                  meta={resolveSlotMeta(slot, boards, itemLists)}
                  otherZone={otherZone}
                  otherZoneLabel={otherZoneLabel}
                  OtherZoneIcon={OtherZoneIcon}
                  folderOptions={folderOptions}
                  onMove={onMove}
                  onSetBadge={onSetBadge}
                  onSetBadgeColor={onSetBadgeColor}
                  onMoveToZone={onMoveToZone}
                  onRemove={onRemove}
                  onMoveToFolder={onMoveToFolder}
                />
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}


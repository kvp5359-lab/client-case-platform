"use client"

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Kanban,
  ListChecks,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ItemList } from '@/hooks/useItemLists'
import {
  BADGE_MODES,
  boardIdFromSlotId,
  listIdFromSlotId,
  navKeyFromSlotId,
  SIDEBAR_NAV_ITEMS,
  type SidebarBadgeMode,
  type SidebarPlacement,
  type SidebarSlot,
} from '@/lib/sidebarSettings'

interface ZoneCardProps {
  title: string
  description: string
  emptyHint: string
  slots: SidebarSlot[]
  boards: { id: string; name: string }[]
  itemLists: ItemList[]
  zone: SidebarPlacement
  onMove: (id: string, delta: -1 | 1) => void
  onSetBadge: (id: string, mode: SidebarBadgeMode) => void
  onMoveToZone: (id: string, placement: SidebarPlacement) => void
  onRemove: (id: string) => void
  warning: string | null
}

export function ZoneCard({
  title,
  description,
  emptyHint,
  slots,
  boards,
  itemLists,
  zone,
  onMove,
  onSetBadge,
  onMoveToZone,
  onRemove,
  warning,
}: ZoneCardProps) {
  const otherZone: SidebarPlacement = zone === 'topbar' ? 'list' : 'topbar'
  const otherZoneLabel = otherZone === 'topbar' ? 'в верх' : 'в список'
  const OtherZoneIcon = otherZone === 'topbar' ? ArrowUp : ArrowDown

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {warning && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>{warning}</div>
          </div>
        )}

        {slots.length === 0 ? (
          <div className="text-sm text-gray-500 rounded-md border border-dashed border-gray-300 px-3 py-4 text-center">
            {emptyHint}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {slots.map((slot, idx) => {
              const canUp = idx > 0
              const canDown = idx < slots.length - 1
              let label: string
              let Icon: typeof Kanban
              if (slot.type === 'nav') {
                const k = navKeyFromSlotId(slot.id)!
                label = SIDEBAR_NAV_ITEMS[k].label
                Icon = SIDEBAR_NAV_ITEMS[k].icon
              } else if (slot.type === 'board') {
                label = boards.find((b) => b.id === boardIdFromSlotId(slot.id))?.name ?? '— удалённая доска —'
                Icon = Kanban
              } else {
                const list = itemLists.find((l) => l.id === listIdFromSlotId(slot.id))
                label = list?.name ?? '— удалённый список —'
                Icon = list?.entity_type === 'project' ? FolderOpen : ListChecks
              }
              return (
                <div key={slot.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Icon className="w-4 h-4 shrink-0 text-gray-500" />
                  <div className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                    {label}
                  </div>
                  <Select
                    value={slot.badge_mode}
                    onValueChange={(v) => onSetBadge(slot.id, v as SidebarBadgeMode)}
                  >
                    <SelectTrigger className="w-[230px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BADGE_MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={!canUp}
                      onClick={() => onMove(slot.id, -1)}
                      title="Выше"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={!canDown}
                      onClick={() => onMove(slot.id, 1)}
                      title="Ниже"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onMoveToZone(slot.id, otherZone)}
                      title={`Переместить ${otherZoneLabel}`}
                    >
                      <OtherZoneIcon className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onRemove(slot.id)}
                      title="Убрать в «Доступные»"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

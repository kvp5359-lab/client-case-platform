"use client"

/**
 * Строка обычного слота (nav/board/list) в редакторе сайдбара.
 */

import { ChevronDown, ChevronUp, MoreHorizontal, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BADGE_MODES,
  type SidebarBadgeColor,
  type SidebarBadgeMode,
  type SidebarPlacement,
  type SidebarSlot,
} from '@/lib/sidebarSettings'
import { BadgeColorPicker } from './BadgeColorPicker'
import type { SlotMeta } from './slotMeta'

export type SlotRowProps = {
  slot: SidebarSlot
  meta: SlotMeta
  canUp: boolean
  canDown: boolean
  otherZone: SidebarPlacement
  otherZoneLabel: string
  OtherZoneIcon: LucideIcon
  folderOptions: { id: string; name: string }[]
  onMove: (id: string, delta: -1 | 1) => void
  onSetBadge: (id: string, mode: SidebarBadgeMode) => void
  onSetBadgeColor: (id: string, color: SidebarBadgeColor) => void
  onMoveToZone: (id: string, placement: SidebarPlacement) => void
  onRemove: (id: string) => void
  onMoveToFolder: (slotId: string, folderId: string | null) => void
  nested?: boolean
}

export function SlotRow({
  slot,
  meta,
  canUp,
  canDown,
  otherZone,
  otherZoneLabel,
  OtherZoneIcon,
  folderOptions,
  onMove,
  onSetBadge,
  onSetBadgeColor,
  onMoveToZone,
  onRemove,
  onMoveToFolder,
  nested,
}: SlotRowProps) {
  const isInFolder = !!slot.parent_id
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 ${nested ? 'pl-9 bg-gray-50/40' : ''}`}>
      <meta.Icon className="w-3.5 h-3.5 shrink-0 text-gray-500" />
      <div className="flex-1 min-w-0 text-sm text-gray-900 truncate">{meta.label}</div>
      <Select
        value={slot.badge_mode}
        onValueChange={(v) => onSetBadge(slot.id, v as SidebarBadgeMode)}
      >
        <SelectTrigger className="w-[230px] h-7 text-xs">
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
      <BadgeColorPicker
        value={slot.badge_color}
        onChange={(c) => onSetBadgeColor(slot.id, c)}
        disabled={slot.badge_mode === 'disabled'}
      />
      <div className="flex items-center gap-0 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={!canUp}
          onClick={() => onMove(slot.id, -1)}
          title="Выше"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={!canDown}
          onClick={() => onMove(slot.id, 1)}
          title="Ниже"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="В папку / из папки"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="end">
            <div className="text-xs text-gray-500 px-2 py-1">Папка</div>
            <button
              type="button"
              className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 ${
                !isInFolder ? 'font-medium' : ''
              }`}
              onClick={() => onMoveToFolder(slot.id, null)}
            >
              Без папки
            </button>
            {folderOptions.length === 0 && (
              <div className="text-xs text-gray-400 px-2 py-1">Папок пока нет</div>
            )}
            {folderOptions.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 ${
                  slot.parent_id === f.id ? 'font-medium' : ''
                }`}
                onClick={() => onMoveToFolder(slot.id, f.id)}
              >
                {f.name}
              </button>
            ))}
            <div className="h-px bg-gray-100 my-1" />
            <button
              type="button"
              className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 text-gray-700"
              onClick={() => onMoveToZone(slot.id, otherZone)}
            >
              <OtherZoneIcon className="inline-block w-3.5 h-3.5 mr-1.5 -mt-0.5" />
              Переместить {otherZoneLabel}
            </button>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onRemove(slot.id)}
          title="Убрать в «Доступные»"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}

"use client"

/**
 * Строка папки в редакторе сайдбара. Контейнер с раскрывающимся
 * списком вложенных слотов (1 уровень вложенности).
 */

import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Folder as FolderIcon,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  type SidebarBadgeColor,
  type SidebarBadgeMode,
  type SidebarPlacement,
  type SidebarSlot,
} from '@/lib/sidebarSettings'
import { BadgeColorPicker } from './BadgeColorPicker'
import { SlotRow } from './SlotRow'
import { resolveSlotMeta } from './slotMeta'

export type FolderRowProps = {
  folder: SidebarSlot
  canUp: boolean
  canDown: boolean
  children_: SidebarSlot[]
  boards: { id: string; name: string }[]
  itemLists: ItemList[]
  otherZone: SidebarPlacement
  otherZoneLabel: string
  OtherZoneIcon: LucideIcon
  folderOptions: { id: string; name: string }[]
  onMove: (id: string, delta: -1 | 1) => void
  onSetBadge: (id: string, mode: SidebarBadgeMode) => void
  onSetBadgeColor: (id: string, color: SidebarBadgeColor) => void
  onMoveToZone: (id: string, placement: SidebarPlacement) => void
  onRemove: (id: string) => void
  onRenameFolder: (slotId: string, name: string) => void
  onMoveToFolder: (slotId: string, folderId: string | null) => void
}

export function FolderRow({
  folder,
  canUp,
  canDown,
  children_,
  boards,
  itemLists,
  otherZone,
  otherZoneLabel,
  OtherZoneIcon,
  folderOptions,
  onMove,
  onSetBadge,
  onSetBadgeColor,
  onMoveToZone,
  onRemove,
  onRenameFolder,
  onMoveToFolder,
}: FolderRowProps) {
  const [expanded, setExpanded] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(folder.name ?? '')

  const commitName = () => {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== folder.name) onRenameFolder(folder.id, trimmed)
    else setDraftName(folder.name ?? '')
    setEditingName(false)
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-gray-500 hover:text-gray-800"
          aria-label={expanded ? 'Свернуть' : 'Развернуть'}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
        <FolderIcon className="w-3.5 h-3.5 shrink-0 text-gray-500" />
        <div className="flex-1 min-w-0">
          {editingName ? (
            <Input
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName()
                if (e.key === 'Escape') {
                  setDraftName(folder.name ?? '')
                  setEditingName(false)
                }
              }}
              className="h-7 text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="text-sm text-gray-900 truncate hover:underline w-full text-left"
              title="Переименовать"
            >
              {folder.name ?? 'Папка'}
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400 shrink-0">{children_.length}</span>
        <Select
          value={folder.badge_mode}
          onValueChange={(v) => onSetBadge(folder.id, v as SidebarBadgeMode)}
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
          value={folder.badge_color}
          onChange={(c) => onSetBadgeColor(folder.id, c)}
          disabled={folder.badge_mode === 'disabled'}
        />
        <div className="flex items-center gap-0 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={!canUp}
            onClick={() => onMove(folder.id, -1)}
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
            onClick={() => onMove(folder.id, 1)}
            title="Ниже"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onMoveToZone(folder.id, otherZone)}
            title={`Переместить ${otherZoneLabel}`}
          >
            <OtherZoneIcon className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onRemove(folder.id)}
            title="Удалить папку (содержимое останется)"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {expanded && children_.length > 0 && (
        <div className="border-t border-gray-100">
          {children_.map((child, idx) => (
            <SlotRow
              key={child.id}
              slot={child}
              meta={resolveSlotMeta(child, boards, itemLists)}
              canUp={idx > 0}
              canDown={idx < children_.length - 1}
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
              nested
            />
          ))}
        </div>
      )}
      {expanded && children_.length === 0 && (
        <div className="border-t border-gray-100 px-3 py-2 pl-9 text-xs text-gray-400">
          Пусто. Используй меню «⋯» у любого пункта, чтобы переложить его сюда.
        </div>
      )}
    </div>
  )
}

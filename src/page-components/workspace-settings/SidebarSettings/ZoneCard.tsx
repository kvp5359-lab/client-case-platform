"use client"

import { useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Kanban,
  ListChecks,
  MoreHorizontal,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ItemList } from '@/hooks/useItemLists'
import {
  BADGE_COLORS,
  BADGE_MODES,
  boardIdFromSlotId,
  childrenOfFolder,
  getBadgeColorMeta,
  listIdFromSlotId,
  navKeyFromSlotId,
  SIDEBAR_NAV_ITEMS,
  topLevelSlots,
  type SidebarBadgeColor,
  type SidebarBadgeMode,
  type SidebarPlacement,
  type SidebarSlot,
} from '@/lib/sidebarSettings'
import type { LucideIcon } from 'lucide-react'

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

/** Маленький круглый swatch-селектор цвета бейджа. */
function BadgeColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: SidebarBadgeColor | undefined
  onChange: (color: SidebarBadgeColor) => void
  disabled?: boolean
}) {
  const current = getBadgeColorMeta(value)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={disabled ? 'Сначала выбери тип бейджа' : `Цвет: ${current.label}`}
          className="h-6 w-6 shrink-0 rounded-full border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-shadow hover:shadow"
          style={{ backgroundColor: current.swatch }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <div className="grid grid-cols-4 gap-1.5">
          {BADGE_COLORS.map((c) => {
            const isSelected = (value ?? 'default') === c.value
            return (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => onChange(c.value)}
                className={`h-7 w-7 rounded-full border-2 transition-all ${
                  isSelected ? 'border-gray-900 scale-110' : 'border-gray-200 hover:border-gray-400'
                }`}
                style={{ backgroundColor: c.swatch }}
              />
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

type SlotMeta = {
  label: string
  Icon: LucideIcon
}

function resolveSlotMeta(
  slot: SidebarSlot,
  boards: ZoneCardProps['boards'],
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

// ── Row для обычного слота (nav/board/list) ──────────────────────

type SlotRowProps = {
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

function SlotRow({
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

// ── Row для папки: контейнер с раскрывающимся списком детей ───

type FolderRowProps = {
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

function FolderRow({
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

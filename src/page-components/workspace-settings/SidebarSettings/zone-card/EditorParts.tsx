"use client"

/**
 * Вынесенные top-level под-компоненты WYSIWYG-редактора сайдбара
 * (`SidebarEditorCanvas`). Каждый зависит только от своих пропсов и импортов.
 */

import { useState, type ReactNode } from 'react'
import {
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown,
  FolderOpen,
  FolderPlus,
  FolderTree,
  GripVertical,
  Kanban,
  Link2,
  ListChecks,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BADGE_MODES,
  BADGE_COLORS,
  SIDEBAR_NAV_ITEMS,
  getBadgeColorMeta,
  type SidebarBadgeMode,
  type SidebarSlot,
} from '@/lib/sidebarSettings'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { THREAD_ICONS } from '@/components/messenger/threadConstants'
import type { AvailableEntry } from '../types'
import { FOLDER_BODY_PREFIX, PALETTE } from '../sidebarDnd'
import { metaFor, type DataCtx } from './editorContext'

export function EmptyHint() {
  return (
    <div className="text-xs text-gray-400 px-2 py-3 w-full text-center">
      Перетащи сюда пункт из «Доступных»
    </div>
  )
}

export function ZoneBox({
  containerId,
  title,
  hint,
  action,
  horizontal,
  children,
}: {
  containerId: string
  title: string
  hint: string
  action?: ReactNode
  horizontal?: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-3 transition-colors ${
        isOver ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs font-medium text-gray-500">{title}</div>
          {!horizontal && <div className="text-[11px] text-gray-400">{hint}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function SlotRow({
  slot,
  data,
  selected,
  onSelect,
  onRemove,
  nested,
}: {
  slot: SidebarSlot
  data: DataCtx
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  nested?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slot.id })
  const meta = metaFor(slot, data)
  const badge = BADGE_MODES.find((m) => m.value === slot.badge_mode)
  const hasBadge = slot.badge_mode !== 'disabled'
  const colorMeta = getBadgeColorMeta(slot.badge_color)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md border cursor-pointer ${
        nested ? 'ml-4' : ''
      } ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-transparent hover:bg-gray-50'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab text-gray-300 hover:text-gray-500"
        aria-label="Перетащить"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <meta.Icon className="w-4 h-4 shrink-0 text-gray-500" />
      <span className="flex-1 min-w-0 text-sm truncate">{meta.label}</span>
      {hasBadge ? (
        <span
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${colorMeta.swatch}22`, color: colorMeta.swatch }}
        >
          {badge?.label}
        </span>
      ) : (
        <span className="text-[11px] text-gray-300 group-hover:text-gray-400">＋ бейдж</span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        aria-label="Убрать из сайдбара"
        className="text-gray-300 md:opacity-0 md:group-hover:opacity-100 hover:text-red-500 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export function TopbarChip({
  slot,
  data,
  selected,
  onSelect,
  onRemove,
}: {
  slot: SidebarSlot
  data: DataCtx
  selected: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slot.id })
  const meta = metaFor(slot, data)
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      title={meta.label}
      className={`group relative flex items-center gap-1 pl-1.5 pr-2 py-1.5 rounded-md border cursor-pointer ${
        selected ? 'border-primary bg-primary/5' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab text-gray-300 hover:text-gray-500"
        aria-label="Перетащить"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <meta.Icon className="w-4 h-4 text-gray-600" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        aria-label="Убрать из сайдбара"
        className="text-gray-300 md:opacity-0 md:group-hover:opacity-100 hover:text-red-500"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function FolderBox({
  folder,
  children_,
  data,
  selectedId,
  onSelect,
  onRemove,
}: {
  folder: SidebarSlot
  children_: SidebarSlot[]
  data: DataCtx
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: folder.id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${FOLDER_BODY_PREFIX}${folder.id}`,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-md border ${isDragging ? 'opacity-50' : ''} ${
        selectedId === folder.id ? 'border-primary' : 'border-gray-200'
      }`}
    >
      <div
        onClick={() => onSelect(folder.id)}
        className="group flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50 rounded-t-md"
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab text-gray-300 hover:text-gray-500"
          aria-label="Перетащить папку"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        <span className="flex-1 min-w-0 text-sm font-medium truncate">
          {folder.name ?? 'Папка'}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(folder.id)
          }}
          aria-label="Убрать папку"
          className="text-gray-300 md:opacity-0 md:group-hover:opacity-100 hover:text-red-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div
        ref={setDropRef}
        className={`px-1 pb-1 pt-0.5 min-h-[34px] rounded-b-md ${
          isOver ? 'bg-primary/5' : ''
        }`}
      >
        <SortableContext
          items={children_.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {children_.map((child) => (
            <SlotRow
              key={child.id}
              slot={child}
              data={data}
              selected={selectedId === child.id}
              onSelect={() => onSelect(child.id)}
              onRemove={() => onRemove(child.id)}
              nested
            />
          ))}
          {children_.length === 0 && (
            <div className="text-[11px] text-gray-400 px-3 py-1.5 text-center">
              Перетащи пункты сюда
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  )
}

export function PaletteGroup({ title, entries }: { title: string; entries: AvailableEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-medium text-gray-400 px-1 pt-1">{title}</div>
      {entries.map((entry) => (
        <PaletteItem key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

export function PaletteBox({
  availableNav,
  availableSections,
  availableBoards,
  availableLists,
  availableQuickActions,
  onCreateSection,
  onCreateLink,
}: {
  availableNav: AvailableEntry[]
  availableSections: AvailableEntry[]
  availableBoards: AvailableEntry[]
  availableLists: AvailableEntry[]
  availableQuickActions: AvailableEntry[]
  onCreateSection: (name: string) => void
  onCreateLink: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: PALETTE })
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const commit = () => {
    const n = name.trim()
    if (n) onCreateSection(n)
    setName('')
    setCreating(false)
  }

  const totalEntries =
    availableNav.length +
    availableSections.length +
    availableBoards.length +
    availableLists.length +
    availableQuickActions.length

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-3 transition-colors ${
        isOver ? 'border-red-300 bg-red-50/40' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-gray-500">Доступные</div>
        {isOver && <div className="text-[11px] text-red-500">Отпусти, чтобы убрать</div>}
      </div>
      <div className="text-[11px] text-gray-400 mb-2">
        Перетащи в верхнюю строку, список или внутрь папки-меню.
      </div>
      <div className="flex flex-col gap-2">
        <PaletteGroup title="Навигация" entries={availableNav} />
        <PaletteGroup title="Действия" entries={availableQuickActions} />
        <PaletteGroup title="Разделы" entries={availableSections} />
        <PaletteGroup title="Доски" entries={availableBoards} />
        <PaletteGroup title="Списки" entries={availableLists} />
        {totalEntries === 0 && (
          <div className="text-[11px] text-gray-400 px-2 py-1">Все пункты уже в сайдбаре</div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-gray-100 mt-1">
          {creating ? (
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setName('')
                }
              }}
              placeholder="Название раздела"
              className="h-8 text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
            >
              <Plus className="w-3.5 h-3.5" /> Создать раздел
            </button>
          )}
          <button
            type="button"
            onClick={onCreateLink}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
          >
            <Link2 className="w-3.5 h-3.5" /> Создать ссылку
          </button>
        </div>
      </div>
    </div>
  )
}

export function PaletteItem({ entry }: { entry: AvailableEntry }) {
  const dragId = `avail:${entry.id}`
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
  })
  const m = {
    Icon:
      entry.kind === 'nav'
        ? SIDEBAR_NAV_ITEMS[entry.navKey].icon
        : entry.kind === 'quickaction'
          ? getChatIconComponent(entry.icon)
          : entry.kind === 'board'
            ? Kanban
            : entry.kind === 'list'
              ? entry.entityType === 'project'
                ? FolderOpen
                : ListChecks
              : FolderTree,
  }
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform) }}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md border border-gray-200 bg-gray-50 cursor-grab text-sm ${
        isDragging ? 'opacity-50' : 'hover:border-gray-300'
      }`}
    >
      <GripVertical className="w-3.5 h-3.5 text-gray-300" />
      <m.Icon className="w-4 h-4 text-gray-500" />
      <span className="truncate">{entry.label}</span>
    </div>
  )
}

export function Inspector({
  slot,
  data,
  onSetBadge,
  onSetBadgeColor,
  onRenameFolder,
  onSetFolderIcon,
  onSetLinkField,
  onRemove,
}: {
  slot: SidebarSlot | null
  data: DataCtx
  onSetBadge: (id: string, mode: SidebarBadgeMode) => void
  onSetBadgeColor: (id: string, color: string) => void
  onRenameFolder: (id: string, name: string) => void
  onSetFolderIcon: (id: string, icon: string) => void
  onSetLinkField: (
    id: string,
    patch: Partial<Pick<SidebarSlot, 'name' | 'url' | 'link_icon'>>,
  ) => void
  onRemove: (id: string) => void
}) {
  if (!slot) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-500 text-center">
        Выбери пункт слева — здесь появятся его настройки (иконка, бейдж, цвет, ссылка).
      </div>
    )
  }
  const meta = metaFor(slot, data)
  const isFolder = slot.type === 'folder'
  const isLink = slot.type === 'link'

  return (
    <div className="rounded-xl border-2 border-primary bg-primary/5 ring-2 ring-primary/15 shadow-sm p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-primary/80 mb-2">
        Настройка пункта
      </div>
      <div className="flex items-center gap-2 mb-3">
        <meta.Icon className="w-4 h-4 text-gray-700" />
        <span className="text-sm font-medium truncate flex-1">{meta.label}</span>
        <button
          type="button"
          onClick={() => onRemove(slot.id)}
          aria-label="Убрать из сайдбара"
          className="text-gray-400 hover:text-red-500"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {isLink ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Название</label>
            <Input
              value={slot.name ?? ''}
              onChange={(e) => onSetLinkField(slot.id, { name: e.target.value })}
              placeholder="Напр. «Сайт компании»"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ссылка (URL)</label>
            <Input
              value={slot.url ?? ''}
              onChange={(e) => onSetLinkField(slot.id, { url: e.target.value })}
              placeholder="https://… или внутренний путь"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Иконка</label>
            <Select
              value={slot.link_icon ?? 'globe'}
              onValueChange={(v) => onSetLinkField(slot.id, { link_icon: v })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THREAD_ICONS.map((i) => {
                  const Ic = i.icon
                  return (
                    <SelectItem key={i.value} value={i.value}>
                      <span className="flex items-center gap-2">
                        <Ic className="w-4 h-4" /> {i.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : isFolder ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Название папки</label>
            <Input
              value={slot.name ?? ''}
              onChange={(e) => onRenameFolder(slot.id, e.target.value)}
              placeholder="Папка"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Иконка</label>
            <Select
              value={slot.folder_icon ?? '__default__'}
              onValueChange={(v) => onSetFolderIcon(slot.id, v === '__default__' ? '' : v)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">
                  <span className="flex items-center gap-2">
                    <FolderPlus className="w-4 h-4" /> Папка (по умолчанию)
                  </span>
                </SelectItem>
                {THREAD_ICONS.map((i) => {
                  const Ic = i.icon
                  return (
                    <SelectItem key={i.value} value={i.value}>
                      <span className="flex items-center gap-2">
                        <Ic className="w-4 h-4" /> {i.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <>
          <label className="block text-xs text-gray-500 mb-1">Бейдж</label>
          <Select
            value={slot.badge_mode}
            onValueChange={(v) => onSetBadge(slot.id, v as SidebarBadgeMode)}
          >
            <SelectTrigger className="h-8 text-sm mb-3">
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

          {slot.badge_mode !== 'disabled' && (
            <>
              <label className="block text-xs text-gray-500 mb-1.5">Цвет</label>
              <div className="flex flex-wrap gap-1.5">
                {BADGE_COLORS.filter((c) => c.value !== 'default').map((c) => {
                  const isSel = (slot.badge_color ?? 'default') === c.value
                  return (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      onClick={() => onSetBadgeColor(slot.id, c.value)}
                      className={`h-6 w-6 rounded-full border-2 transition-all ${
                        isSel ? 'border-gray-900 scale-110' : 'border-gray-200 hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: c.swatch }}
                    />
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export function DragGhost({
  activeId,
  slots,
  data,
}: {
  activeId: string
  slots: SidebarSlot[]
  data: DataCtx
}) {
  if (activeId.startsWith('avail:')) {
    return (
      <div className="px-2 py-1.5 rounded-md border border-gray-300 bg-white text-sm shadow-sm">
        Добавить пункт
      </div>
    )
  }
  const slot = slots.find((s) => s.id === activeId)
  if (!slot) return null
  const meta = metaFor(slot, data)
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-gray-300 bg-white text-sm shadow-sm">
      <meta.Icon className="w-4 h-4 text-gray-600" />
      <span>{meta.label}</span>
    </div>
  )
}

"use client"

/**
 * WYSIWYG-редактор сайдбара (профиля настроек).
 *
 * Слева — макет сайдбара: зона иконок (топбар) + зона списка с папками.
 * Справа — палитра «Доступные» (источник для drag) + инспектор настроек выбранного
 * пункта (бейдж + цвет, переименование папки, удаление).
 *
 * Перемещение единым drag-паттерном (@dnd-kit): реордер, перенос между зонами,
 * втаскивание в папку, drop в палитру = убрать. Плюс ✕ на строке при наведении.
 * Чистая логика перемещений — в `sidebarDnd.ts`.
 */

import { useMemo, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown,
  FolderPlus,
  GripVertical,
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
import type { ItemList } from '@/hooks/useItemLists'
import {
  BADGE_MODES,
  BADGE_COLORS,
  SIDEBAR_NAV_ITEMS,
  SIDEBAR_NAV_KEYS,
  getBadgeColorMeta,
  type SidebarBadgeMode,
  type SidebarPlacement,
  type SidebarSlot,
} from '@/lib/sidebarSettings'
import { resolveSlotMeta } from './zone-card/slotMeta'
import type { AvailableEntry } from './types'
import {
  FOLDER_BODY_PREFIX,
  PALETTE,
  ZONE_LIST,
  ZONE_TOPBAR,
  applyAdd,
  applyMove,
  applyRemove,
  resolveContainer,
} from './sidebarDnd'

type DataCtx = {
  boards: { id: string; name: string }[]
  itemLists: ItemList[]
  sections: { id: string; name: string }[]
}

export type SidebarEditorCanvasProps = DataCtx & {
  slots: SidebarSlot[]
  onChange: (next: SidebarSlot[]) => void
  onCreateSection: (name: string) => void
}

function newUuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function defaultBadgeForEntry(entry: AvailableEntry): SidebarBadgeMode {
  if (entry.kind === 'nav' && entry.navKey === 'inbox') return 'unread_threads'
  if (entry.kind === 'nav' && entry.navKey === 'tasks') return 'my_active_tasks'
  return 'disabled'
}

export function SidebarEditorCanvas({
  slots,
  boards,
  itemLists,
  sections,
  onChange,
  onCreateSection,
}: SidebarEditorCanvasProps) {
  const data: DataCtx = { boards, itemLists, sections }
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const sorted = useMemo(() => [...slots].sort((a, b) => a.order - b.order), [slots])
  const topbar = useMemo(
    () => sorted.filter((s) => s.placement === 'topbar' && !s.parent_id),
    [sorted],
  )
  const listTop = useMemo(
    () => sorted.filter((s) => s.placement === 'list' && !s.parent_id),
    [sorted],
  )

  const placedIds = useMemo(() => new Set(slots.map((s) => s.id)), [slots])
  const availableNav: AvailableEntry[] = useMemo(() => {
    const entries = SIDEBAR_NAV_KEYS.filter((key) => !placedIds.has(`nav:${key}`)).map(
      (key) => ({
        kind: 'nav' as const,
        id: `nav:${key}`,
        label: SIDEBAR_NAV_ITEMS[key].label,
        navKey: key,
      }),
    )
    entries.sort((a, b) => a.label.localeCompare(b.label, 'ru'))
    return entries
  }, [placedIds])

  const availableSections: AvailableEntry[] = useMemo(
    () =>
      sections
        .filter((s) => !placedIds.has(`section:${s.id}`))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((s) => ({
          kind: 'section' as const,
          id: `section:${s.id}`,
          label: s.name,
          sectionId: s.id,
        })),
    [placedIds, sections],
  )

  const selectedSlot = selectedId ? slots.find((s) => s.id === selectedId) ?? null : null

  const entryFromActive = (id: string): AvailableEntry | null => {
    if (id.startsWith('avail:nav:')) {
      const key = id.slice('avail:nav:'.length)
      const nk = SIDEBAR_NAV_KEYS.find((k) => k === key)
      return nk
        ? { kind: 'nav', id: `nav:${nk}`, label: SIDEBAR_NAV_ITEMS[nk].label, navKey: nk }
        : null
    }
    if (id.startsWith('avail:section:')) {
      const sid = id.slice('avail:section:'.length)
      const sec = sections.find((s) => s.id === sid)
      return sec
        ? { kind: 'section', id: `section:${sid}`, label: sec.name, sectionId: sid }
        : null
    }
    return null
  }

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const activeStr = String(active.id)
    const overStr = String(over.id)
    const targetContainer = resolveContainer(slots, overStr)
    const beforeId =
      overStr === ZONE_TOPBAR ||
      overStr === ZONE_LIST ||
      overStr === PALETTE ||
      overStr.startsWith(FOLDER_BODY_PREFIX)
        ? null
        : overStr

    // Перетаскивание из палитры → добавить.
    if (activeStr.startsWith('avail:')) {
      if (!targetContainer || targetContainer === PALETTE) return
      const entry = entryFromActive(activeStr)
      if (!entry) return
      const newSlot: SidebarSlot = {
        id: entry.id,
        type: entry.kind,
        placement: targetContainer === ZONE_TOPBAR ? 'topbar' : 'list',
        order: 0,
        badge_mode: defaultBadgeForEntry(entry),
      }
      onChange(applyAdd(slots, newSlot, targetContainer, beforeId))
      return
    }

    // Перемещение существующего слота.
    if (!targetContainer) return
    if (targetContainer === PALETTE) {
      onChange(applyRemove(slots, activeStr))
      if (selectedId === activeStr) setSelectedId(null)
      return
    }
    const moving = slots.find((s) => s.id === activeStr)
    if (moving?.type === 'folder' && targetContainer.startsWith(FOLDER_BODY_PREFIX)) {
      return // папку в папку нельзя
    }
    if (activeStr === overStr) return
    onChange(applyMove(slots, activeStr, targetContainer, beforeId))
  }

  const setBadge = (id: string, mode: SidebarBadgeMode) =>
    onChange(slots.map((s) => (s.id === id ? { ...s, badge_mode: mode } : s)))
  const setBadgeColor = (id: string, color: string) =>
    onChange(
      slots.map((s) =>
        s.id === id
          ? color === 'default'
            ? { ...s, badge_color: undefined }
            : { ...s, badge_color: color as SidebarSlot['badge_color'] }
          : s,
      ),
    )
  const renameFolder = (id: string, name: string) =>
    onChange(slots.map((s) => (s.id === id ? { ...s, name } : s)))
  const removeSlot = (id: string) => {
    onChange(applyRemove(slots, id))
    if (selectedId === id) setSelectedId(null)
  }
  const createFolder = (placement: SidebarPlacement) => {
    const slot: SidebarSlot = {
      id: `folder:${newUuid()}`,
      type: 'folder',
      placement,
      order: 999,
      badge_mode: 'disabled',
      name: 'Новая папка',
      parent_id: null,
    }
    onChange(applyAdd(slots, slot, `zone:${placement}`, null))
    setSelectedId(slot.id)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3">
        {/* Левая колонка — макет сайдбара */}
        <div className="flex flex-col gap-3">
          <ZoneBox
            containerId={ZONE_TOPBAR}
            title="Верхняя строка"
            hint="Иконки сверху. Перетащи сюда из «Доступных»."
            horizontal
          >
            <SortableContext
              items={topbar.map((s) => s.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex flex-wrap gap-1.5">
                {topbar.map((slot) => (
                  <TopbarChip
                    key={slot.id}
                    slot={slot}
                    data={data}
                    selected={selectedId === slot.id}
                    onSelect={() => setSelectedId(slot.id)}
                    onRemove={() => removeSlot(slot.id)}
                  />
                ))}
                {topbar.length === 0 && <EmptyHint />}
              </div>
            </SortableContext>
          </ZoneBox>

          <ZoneBox
            containerId={ZONE_LIST}
            title="Список"
            hint="Полные пункты. Папки группируют пункты."
            action={
              <button
                type="button"
                onClick={() => createFolder('list')}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
              >
                <FolderPlus className="w-3.5 h-3.5" /> Папка
              </button>
            }
          >
            <SortableContext
              items={listTop.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-1">
                {listTop.map((slot) =>
                  slot.type === 'folder' ? (
                    <FolderBox
                      key={slot.id}
                      folder={slot}
                      children_={sorted.filter((s) => s.parent_id === slot.id)}
                      data={data}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onRemove={removeSlot}
                    />
                  ) : (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      data={data}
                      selected={selectedId === slot.id}
                      onSelect={() => setSelectedId(slot.id)}
                      onRemove={() => removeSlot(slot.id)}
                    />
                  ),
                )}
                {listTop.length === 0 && <EmptyHint />}
              </div>
            </SortableContext>
          </ZoneBox>
        </div>

        {/* Правая колонка — палитра + инспектор */}
        <div className="flex flex-col gap-3">
          <PaletteBox
            availableNav={availableNav}
            availableSections={availableSections}
            onCreateSection={onCreateSection}
          />
          <Inspector
            slot={selectedSlot}
            data={data}
            onSetBadge={setBadge}
            onSetBadgeColor={setBadgeColor}
            onRenameFolder={renameFolder}
            onRemove={removeSlot}
          />
        </div>
      </div>

      <DragOverlay>
        {activeId ? <DragGhost activeId={activeId} slots={slots} data={data} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function EmptyHint() {
  return (
    <div className="text-xs text-gray-400 px-2 py-3 w-full text-center">
      Перетащи сюда пункт из «Доступных»
    </div>
  )
}

function ZoneBox({
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

function SlotRow({
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
  const meta = resolveSlotMeta(slot, data.boards, data.itemLists, data.sections)
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
        className="text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function TopbarChip({
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
  const meta = resolveSlotMeta(slot, data.boards, data.itemLists, data.sections)
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
        className="text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function FolderBox({
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
          className="text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
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

function PaletteBox({
  availableNav,
  availableSections,
  onCreateSection,
}: {
  availableNav: AvailableEntry[]
  availableSections: AvailableEntry[]
  onCreateSection: (name: string) => void
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
      <div className="flex flex-col gap-1.5">
        {[...availableNav, ...availableSections].map((entry) => (
          <PaletteItem key={entry.id} entry={entry} />
        ))}
        {availableNav.length === 0 && availableSections.length === 0 && (
          <div className="text-[11px] text-gray-400 px-2 py-1">Все пункты уже в сайдбаре</div>
        )}

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
      </div>
    </div>
  )
}

function PaletteItem({ entry }: { entry: AvailableEntry }) {
  const dragId = `avail:${entry.id}`
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
  })
  const Icon =
    entry.kind === 'nav' ? SIDEBAR_NAV_ITEMS[entry.navKey].icon : undefined
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
      {Icon ? (
        <Icon className="w-4 h-4 text-gray-500" />
      ) : (
        <FolderPlus className="w-4 h-4 text-gray-500" />
      )}
      <span className="truncate">{entry.label}</span>
    </div>
  )
}

function Inspector({
  slot,
  data,
  onSetBadge,
  onSetBadgeColor,
  onRenameFolder,
  onRemove,
}: {
  slot: SidebarSlot | null
  data: DataCtx
  onSetBadge: (id: string, mode: SidebarBadgeMode) => void
  onSetBadgeColor: (id: string, color: string) => void
  onRenameFolder: (id: string, name: string) => void
  onRemove: (id: string) => void
}) {
  if (!slot) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-400">
        Выбери пункт слева, чтобы настроить бейдж и цвет.
      </div>
    )
  }
  const meta = resolveSlotMeta(slot, data.boards, data.itemLists, data.sections)
  const isFolder = slot.type === 'folder'

  return (
    <div className="rounded-xl border border-primary/40 bg-white p-3">
      <div className="flex items-center gap-2 mb-3">
        <meta.Icon className="w-4 h-4 text-gray-600" />
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

      {isFolder ? (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Название папки</label>
          <Input
            value={slot.name ?? ''}
            onChange={(e) => onRenameFolder(slot.id, e.target.value)}
            placeholder="Папка"
            className="h-8 text-sm"
          />
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

function DragGhost({
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
  const meta = resolveSlotMeta(slot, data.boards, data.itemLists, data.sections)
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-gray-300 bg-white text-sm shadow-sm">
      <meta.Icon className="w-4 h-4 text-gray-600" />
      <span>{meta.label}</span>
    </div>
  )
}

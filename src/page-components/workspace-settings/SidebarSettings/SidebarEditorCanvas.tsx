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
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { FolderPlus } from 'lucide-react'
import {
  SIDEBAR_NAV_ITEMS,
  SIDEBAR_NAV_KEYS,
  type SidebarBadgeMode,
  type SidebarPlacement,
  type SidebarSlot,
} from '@/lib/sidebarSettings'
import { useActiveInterfacePreset } from '@/hooks/useInterfacePresets'
import type { ItemList } from '@/hooks/useItemLists'
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
import { type DataCtx } from './zone-card/editorContext'
import {
  DragGhost,
  EmptyHint,
  FolderBox,
  Inspector,
  PaletteBox,
  SlotRow,
  TopbarChip,
  ZoneBox,
} from './zone-card/EditorParts'

export type SidebarEditorCanvasProps = {
  slots: SidebarSlot[]
  boards: { id: string; name: string }[]
  itemLists: ItemList[]
  sections: { id: string; name: string }[]
  workspaceId: string
  onChange: (next: SidebarSlot[]) => void
  onCreateSection: (name: string) => void
  /** Доп. блок в правой колонке (под палитрой и инспектором). */
  rightExtra?: ReactNode
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
  workspaceId,
  onChange,
  onCreateSection,
  rightExtra,
}: SidebarEditorCanvasProps) {
  const { quickActions } = useActiveInterfacePreset(workspaceId)
  const data: DataCtx = { boards, itemLists, sections, quickActions }
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

  // Палитра показывает ВСЕ доступные сущности — даже уже размещённые: один и тот
  // же пункт можно добавить в сайдбар несколько раз (в разные папки/зоны).
  const availableNav: AvailableEntry[] = useMemo(() => {
    const entries = SIDEBAR_NAV_KEYS.map((key) => ({
      kind: 'nav' as const,
      id: `nav:${key}`,
      label: SIDEBAR_NAV_ITEMS[key].label,
      navKey: key,
    }))
    entries.sort((a, b) => a.label.localeCompare(b.label, 'ru'))
    return entries
  }, [])

  const availableSections: AvailableEntry[] = useMemo(
    () =>
      sections
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((s) => ({
          kind: 'section' as const,
          id: `section:${s.id}`,
          label: s.name,
          sectionId: s.id,
        })),
    [sections],
  )

  const availableQuickActions: AvailableEntry[] = useMemo(
    () =>
      quickActions.map((a) => ({
        kind: 'quickaction' as const,
        id: `quickaction:${a.id}`,
        label: a.label,
        actionId: a.id,
        icon: a.icon,
      })),
    [quickActions],
  )

  const availableBoards: AvailableEntry[] = useMemo(
    () =>
      boards
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((b) => ({ kind: 'board' as const, id: `board:${b.id}`, label: b.name, boardId: b.id })),
    [boards],
  )

  const availableLists: AvailableEntry[] = useMemo(
    () =>
      itemLists
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((l) => ({
          kind: 'list' as const,
          id: `list:${l.id}`,
          label: l.name,
          listId: l.id,
          entityType: l.entity_type,
        })),
    [itemLists],
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
    if (id.startsWith('avail:quickaction:')) {
      const aid = id.slice('avail:quickaction:'.length)
      const a = quickActions.find((x) => x.id === aid)
      return a
        ? { kind: 'quickaction', id: `quickaction:${aid}`, label: a.label, actionId: aid, icon: a.icon }
        : null
    }
    if (id.startsWith('avail:board:')) {
      const bid = id.slice('avail:board:'.length)
      const b = boards.find((x) => x.id === bid)
      return b ? { kind: 'board', id: `board:${bid}`, label: b.name, boardId: bid } : null
    }
    if (id.startsWith('avail:list:')) {
      const lid = id.slice('avail:list:'.length)
      const l = itemLists.find((x) => x.id === lid)
      return l
        ? { kind: 'list', id: `list:${lid}`, label: l.name, listId: lid, entityType: l.entity_type }
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
      // Уникальный id экземпляра + ref на сущность — один пункт можно разместить
      // несколько раз (в разных папках/зонах), он не исчезает из палитры.
      const newSlot: SidebarSlot = {
        id: `slot:${newUuid()}`,
        ref: entry.id,
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
  const setFolderIcon = (id: string, icon: string) =>
    onChange(slots.map((s) => (s.id === id ? { ...s, folder_icon: icon } : s)))
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

  const createLink = () => {
    const slot: SidebarSlot = {
      id: `link:${newUuid()}`,
      type: 'link',
      placement: 'list',
      order: 999,
      badge_mode: 'disabled',
      name: 'Новая ссылка',
      url: '',
      link_icon: 'globe',
    }
    onChange(applyAdd(slots, slot, ZONE_LIST, null))
    setSelectedId(slot.id)
  }

  const setLinkField = (id: string, patch: Partial<Pick<SidebarSlot, 'name' | 'url' | 'link_icon'>>) =>
    onChange(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:items-start">
        {/* Левая колонка — макет сайдбара. Независимый скролл от палитры. */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-2 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-1">
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

        {/* Правая колонка — палитра + инспектор. Независимый скролл от макета. */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-2 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-1">
          <Inspector
            slot={selectedSlot}
            data={data}
            onSetBadge={setBadge}
            onSetBadgeColor={setBadgeColor}
            onRenameFolder={renameFolder}
            onSetFolderIcon={setFolderIcon}
            onSetLinkField={setLinkField}
            onRemove={removeSlot}
          />
          <PaletteBox
            availableNav={availableNav}
            availableSections={availableSections}
            availableBoards={availableBoards}
            availableLists={availableLists}
            availableQuickActions={availableQuickActions}
            onCreateSection={onCreateSection}
            onCreateLink={createLink}
          />
          {rightExtra}
        </div>
      </div>

      <DragOverlay>
        {activeId ? <DragGhost activeId={activeId} slots={slots} data={data} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

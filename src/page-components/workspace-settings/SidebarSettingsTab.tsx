"use client"

/**
 * SidebarSettingsTab — раздел «Сайдбар» в настройках воркспейса.
 *
 * Три зоны:
 *   1. Верхняя строка (иконки)  — `placement: 'topbar'`
 *   2. Список                   — `placement: 'list'`
 *   3. Доступные                — всё, что не в slots (пункты меню + доски)
 *
 * Любой элемент (пункт меню или доска) перемещается между зонами кнопками.
 * У каждого размещённого элемента — селектор бейджа (один и тот же набор).
 *
 * Доступ: только владелец воркспейса.
 *
 * Дочерние компоненты `ZoneCard` / `AvailableCard` живут в `./SidebarSettings/`.
 */

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import { useItemLists, type ItemList } from '@/hooks/useItemLists'
import { useSections, useCreateSection } from '@/hooks/useSections'
import {
  useUpdateWorkspaceSidebarSettings,
  useWorkspaceSidebarSettings,
} from '@/hooks/useWorkspaceSidebarSettings'
import {
  boardIdFromSlotId,
  DEFAULT_SIDEBAR_SLOTS,
  listIdFromSlotId,
  sectionIdFromSlotId,
  reorderWithinZones,
  SIDEBAR_NAV_ITEMS,
  SIDEBAR_NAV_KEYS,
  TOPBAR_SOFT_LIMIT,
  type SidebarBadgeMode,
  type SidebarBadgeColor,
  type SidebarPlacement,
  type SidebarSlot,
} from '@/lib/sidebarSettings'
import { AvailableCard } from './SidebarSettings/AvailableCard'
import { ZoneCard } from './SidebarSettings/ZoneCard'
import type { AvailableEntry } from './SidebarSettings/types'

export function SidebarSettingsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const permissions = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const isOwner = permissions.isOwner

  const { data: settings, isLoading } = useWorkspaceSidebarSettings(workspaceId)
  const { data: boards = [] } = useBoardsQuery(workspaceId)
  const { data: itemLists = [] } = useItemLists(workspaceId)
  const { data: sections = [] } = useSections(workspaceId)
  const createSection = useCreateSection()
  const update = useUpdateWorkspaceSidebarSettings()

  const [override, setOverride] = useState<SidebarSlot[] | null>(null)
  const slots = override ?? settings?.slots ?? DEFAULT_SIDEBAR_SLOTS

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-gray-600">
          Доступ к настройкам сайдбара только у владельца воркспейса.
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-gray-600 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Загружаем настройки…
        </CardContent>
      </Card>
    )
  }

  const handleSave = async () => {
    if (!workspaceId) return
    try {
      await update.mutateAsync({ workspaceId, slots })
      setOverride(null)
      toast.success('Настройки сайдбара сохранены')
    } catch (err) {
      toast.error('Не удалось сохранить', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleResetDefaults = () => setOverride([...DEFAULT_SIDEBAR_SLOTS])

  const dirty = override !== null

  return (
    <SidebarSettingsView
      slots={slots}
      boards={boards.map((b) => ({ id: b.id, name: b.name }))}
      itemLists={itemLists}
      sections={sections.map((s) => ({ id: s.id, name: s.name }))}
      onCreateSection={(name) => {
        if (workspaceId) createSection.mutate({ workspace_id: workspaceId, name })
      }}
      onChange={setOverride}
      onSave={handleSave}
      onReset={handleResetDefaults}
      dirty={dirty}
      saving={update.isPending}
    />
  )
}

function SidebarSettingsView({
  slots,
  boards,
  itemLists,
  sections,
  onCreateSection,
  onChange,
  onSave,
  onReset,
  dirty,
  saving,
}: {
  slots: SidebarSlot[]
  boards: { id: string; name: string }[]
  itemLists: ItemList[]
  sections: { id: string; name: string }[]
  onCreateSection: (name: string) => void
  onChange: (next: SidebarSlot[]) => void
  onSave: () => void
  onReset: () => void
  dirty: boolean
  saving: boolean
}) {
  const sorted = useMemo(() => [...slots].sort((a, b) => a.order - b.order), [slots])
  const topbar = useMemo(() => sorted.filter((s) => s.placement === 'topbar'), [sorted])
  const list = useMemo(() => sorted.filter((s) => s.placement === 'list'), [sorted])

  // Доступные nav-пункты = все возможные пункты меню минус уже размещённые.
  const placedIds = useMemo(() => new Set(slots.map((s) => s.id)), [slots])
  const availableNav: AvailableEntry[] = useMemo(() => {
    const entries: AvailableEntry[] = SIDEBAR_NAV_KEYS.filter(
      (key) => !placedIds.has(`nav:${key}`),
    ).map((key) => ({
      kind: 'nav' as const,
      id: `nav:${key}`,
      label: SIDEBAR_NAV_ITEMS[key].label,
      navKey: key,
    }))
    entries.sort((a, b) => a.label.localeCompare(b.label, 'ru'))
    return entries
  }, [placedIds])

  // Незакреплённые разделы — для группового пункта «Раздел» в «Доступных».
  const availableSections = useMemo(
    () =>
      sections
        .filter((s) => !placedIds.has(`section:${s.id}`))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [placedIds, sections],
  )

  // Очистка слотов от мёртвых элементов (удалённых из воркспейса досок/списков/
  // разделов). nav/folder — всегда живые.
  const liveSlots = useMemo(() => {
    const boardIds = new Set(boards.map((b) => b.id))
    const listIds = new Set(itemLists.map((l) => l.id))
    const sectionIds = new Set(sections.map((s) => s.id))
    return slots.filter((s) => {
      if (s.type === 'nav' || s.type === 'folder') return true
      if (s.type === 'board') {
        const bid = boardIdFromSlotId(s.id)
        return bid ? boardIds.has(bid) : false
      }
      if (s.type === 'list') {
        const lid = listIdFromSlotId(s.id)
        return lid ? listIds.has(lid) : false
      }
      // type === 'section'
      const sid = sectionIdFromSlotId(s.id)
      return sid ? sectionIds.has(sid) : false
    })
  }, [slots, boards, itemLists, sections])
  const hasDeadSlots = liveSlots.length !== slots.length

  const moveWithinZone = (slotId: string, delta: -1 | 1) => {
    const next = [...sorted]
    const idx = next.findIndex((s) => s.id === slotId)
    if (idx < 0) return
    const target = next[idx]
    const targetParent = target.parent_id ?? null
    let swap = -1
    if (delta === -1) {
      for (let i = idx - 1; i >= 0; i--) {
        if (next[i].placement === target.placement && (next[i].parent_id ?? null) === targetParent) {
          swap = i
          break
        }
      }
    } else {
      for (let i = idx + 1; i < next.length; i++) {
        if (next[i].placement === target.placement && (next[i].parent_id ?? null) === targetParent) {
          swap = i
          break
        }
      }
    }
    if (swap < 0) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onChange(reorderWithinZones(next))
  }

  const createFolder = (placement: SidebarPlacement) => {
    const uuid =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const slot: SidebarSlot = {
      id: `folder:${uuid}`,
      type: 'folder',
      placement,
      order: 0,
      badge_mode: 'disabled',
      name: 'Новая папка',
      parent_id: null,
    }
    onChange(reorderWithinZones([...slots, slot]))
  }

  const renameFolder = (slotId: string, name: string) => {
    onChange(slots.map((s) => (s.id === slotId ? { ...s, name } : s)))
  }

  const moveToFolder = (slotId: string, folderId: string | null) => {
    const target = slots.find((s) => s.id === slotId)
    if (!target) return
    // Папка не может быть в папке.
    if (target.type === 'folder' && folderId) return
    // Папка-получатель должна быть той же зоны.
    if (folderId) {
      const folder = slots.find((s) => s.id === folderId)
      if (!folder || folder.type !== 'folder' || folder.placement !== target.placement) return
    }
    onChange(
      reorderWithinZones(
        slots.map((s) => (s.id === slotId ? { ...s, parent_id: folderId } : s)),
      ),
    )
  }

  const setBadge = (slotId: string, mode: SidebarBadgeMode) => {
    onChange(slots.map((s) => (s.id === slotId ? { ...s, badge_mode: mode } : s)))
  }

  const setBadgeColor = (slotId: string, color: SidebarBadgeColor) => {
    onChange(
      slots.map((s) =>
        s.id === slotId
          ? color === 'default'
            ? { ...s, badge_color: undefined }
            : { ...s, badge_color: color }
          : s,
      ),
    )
  }

  const moveToZone = (slotId: string, placement: SidebarPlacement) => {
    const target = slots.find((s) => s.id === slotId)
    if (!target || target.placement === placement) return
    // Если перемещаем папку — тащим её детей в новую зону.
    const next = slots.map((s) => {
      if (s.id === slotId) return { ...s, placement, parent_id: null }
      if (target.type === 'folder' && s.parent_id === slotId) return { ...s, placement }
      return s
    })
    onChange(reorderWithinZones(next))
  }

  const removeFromSidebar = (slotId: string) => {
    const target = slots.find((s) => s.id === slotId)
    if (!target) return
    // При удалении папки её дети остаются в той же зоне, но на верхнем уровне.
    const cleared = slots
      .filter((s) => s.id !== slotId)
      .map((s) => (target.type === 'folder' && s.parent_id === slotId ? { ...s, parent_id: null } : s))
    onChange(reorderWithinZones(cleared))
  }

  const addToZone = (entry: AvailableEntry, placement: SidebarPlacement) => {
    const baseBadge: SidebarBadgeMode =
      entry.kind === 'nav' && entry.navKey === 'inbox'
        ? 'unread_threads'
        : entry.kind === 'nav' && entry.navKey === 'tasks'
          ? 'my_active_tasks'
          : 'disabled'
    const slot: SidebarSlot = {
      id: entry.id,
      type: entry.kind,
      placement,
      order: 0, // reorder перенумерует
      badge_mode: baseBadge,
    }
    onChange(reorderWithinZones([...slots, slot]))
  }

  const cleanDeadSlots = () => onChange(reorderWithinZones(liveSlots))

  return (
    <div className="space-y-6">
      {hasDeadSlots && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            В сайдбаре есть {slots.length - liveSlots.length} «мёртвых» элемента —
            доски, которых больше нет в воркспейсе.
          </div>
          <Button size="sm" variant="outline" onClick={cleanDeadSlots}>
            Очистить
          </Button>
        </div>
      )}

      <ZoneCard
        title="Верхняя строка"
        description="Иконки в верхней части сайдбара."
        emptyHint="Пусто. Добавь элементы из «Доступных» ниже."
        slots={topbar}
        boards={boards}
        itemLists={itemLists}
        sections={sections}
        zone="topbar"
        onMove={moveWithinZone}
        onSetBadge={setBadge}
        onSetBadgeColor={setBadgeColor}
        onMoveToZone={moveToZone}
        onRemove={removeFromSidebar}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onMoveToFolder={moveToFolder}
        warning={
          topbar.length > TOPBAR_SOFT_LIMIT
            ? `В верхней строке ${topbar.length} иконок. Рекомендуется не больше ${TOPBAR_SOFT_LIMIT}.`
            : null
        }
      />

      <ZoneCard
        title="Список"
        description="Полные пункты в основном списке сайдбара."
        emptyHint="Пусто. Добавь элементы из «Доступных» ниже."
        slots={list}
        boards={boards}
        itemLists={itemLists}
        sections={sections}
        zone="list"
        onMove={moveWithinZone}
        onSetBadge={setBadge}
        onSetBadgeColor={setBadgeColor}
        onMoveToZone={moveToZone}
        onRemove={removeFromSidebar}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onMoveToFolder={moveToFolder}
        warning={null}
      />

      <AvailableCard
        availableNav={availableNav}
        availableSections={availableSections}
        onAdd={addToZone}
        onCreateSection={onCreateSection}
      />

      <div className="flex flex-wrap gap-2 sticky bottom-0 bg-white py-3 border-t border-gray-200">
        <Button onClick={onSave} disabled={saving || !dirty}>
          {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Сохранить
        </Button>
        <Button type="button" variant="outline" onClick={onReset}>
          Сбросить к стандартным
        </Button>
      </div>
    </div>
  )
}

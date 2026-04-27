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
 */

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Loader2,
  Kanban,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import {
  useWorkspaceSidebarSettings,
  useUpdateWorkspaceSidebarSettings,
} from '@/hooks/useWorkspaceSidebarSettings'
import {
  type SidebarSlot,
  type SidebarPlacement,
  type SidebarBadgeMode,
  type SidebarNavKey,
  SIDEBAR_NAV_ITEMS,
  SIDEBAR_NAV_KEYS,
  BADGE_MODES,
  TOPBAR_SOFT_LIMIT,
  DEFAULT_SIDEBAR_SLOTS,
  reorderWithinZones,
  navKeyFromSlotId,
  boardIdFromSlotId,
} from '@/lib/sidebarSettings'

type AvailableEntry =
  | { kind: 'nav'; id: string; label: string; navKey: SidebarNavKey }
  | { kind: 'board'; id: string; label: string; boardId: string }

export function SidebarSettingsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const permissions = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const isOwner = permissions.isOwner

  const { data: settings, isLoading } = useWorkspaceSidebarSettings(workspaceId)
  const { data: boards = [] } = useBoardsQuery(workspaceId)
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
  onChange,
  onSave,
  onReset,
  dirty,
  saving,
}: {
  slots: SidebarSlot[]
  boards: { id: string; name: string }[]
  onChange: (next: SidebarSlot[]) => void
  onSave: () => void
  onReset: () => void
  dirty: boolean
  saving: boolean
}) {
  const sorted = useMemo(() => [...slots].sort((a, b) => a.order - b.order), [slots])
  const topbar = useMemo(() => sorted.filter((s) => s.placement === 'topbar'), [sorted])
  const list = useMemo(() => sorted.filter((s) => s.placement === 'list'), [sorted])

  // Доступные = все возможные элементы минус те, что уже в slots.
  const placedIds = useMemo(() => new Set(slots.map((s) => s.id)), [slots])
  const available: AvailableEntry[] = useMemo(() => {
    const navEntries: AvailableEntry[] = SIDEBAR_NAV_KEYS.filter(
      (key) => !placedIds.has(`nav:${key}`),
    ).map((key) => ({
      kind: 'nav' as const,
      id: `nav:${key}`,
      label: SIDEBAR_NAV_ITEMS[key].label,
      navKey: key,
    }))
    const boardEntries: AvailableEntry[] = boards
      .filter((b) => !placedIds.has(`board:${b.id}`))
      .map((b) => ({
        kind: 'board' as const,
        id: `board:${b.id}`,
        label: b.name,
        boardId: b.id,
      }))
    // Сортировка по алфавиту внутри каждой группы; пункты меню — первыми.
    navEntries.sort((a, b) => a.label.localeCompare(b.label, 'ru'))
    boardEntries.sort((a, b) => a.label.localeCompare(b.label, 'ru'))
    return [...navEntries, ...boardEntries]
  }, [placedIds, boards])

  // Очистка слотов от мёртвых досок (удалённых из воркспейса).
  const liveSlots = useMemo(() => {
    const boardIds = new Set(boards.map((b) => b.id))
    return slots.filter((s) => {
      if (s.type === 'nav') return true
      const bid = boardIdFromSlotId(s.id)
      return bid ? boardIds.has(bid) : false
    })
  }, [slots, boards])
  const hasDeadSlots = liveSlots.length !== slots.length

  const moveWithinZone = (slotId: string, delta: -1 | 1) => {
    const next = [...sorted]
    const idx = next.findIndex((s) => s.id === slotId)
    if (idx < 0) return
    const target = next[idx]
    let swap = -1
    if (delta === -1) {
      for (let i = idx - 1; i >= 0; i--) {
        if (next[i].placement === target.placement) {
          swap = i
          break
        }
      }
    } else {
      for (let i = idx + 1; i < next.length; i++) {
        if (next[i].placement === target.placement) {
          swap = i
          break
        }
      }
    }
    if (swap < 0) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onChange(reorderWithinZones(next))
  }

  const setBadge = (slotId: string, mode: SidebarBadgeMode) => {
    onChange(slots.map((s) => (s.id === slotId ? { ...s, badge_mode: mode } : s)))
  }

  const moveToZone = (slotId: string, placement: SidebarPlacement) => {
    const idx = slots.findIndex((s) => s.id === slotId)
    if (idx < 0) return
    if (slots[idx].placement === placement) return
    const next = slots.map((s) => (s.id === slotId ? { ...s, placement } : s))
    onChange(reorderWithinZones(next))
  }

  const removeFromSidebar = (slotId: string) => {
    onChange(reorderWithinZones(slots.filter((s) => s.id !== slotId)))
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
      type: entry.kind === 'nav' ? 'nav' : 'board',
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
        zone="topbar"
        onMove={moveWithinZone}
        onSetBadge={setBadge}
        onMoveToZone={moveToZone}
        onRemove={removeFromSidebar}
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
        zone="list"
        onMove={moveWithinZone}
        onSetBadge={setBadge}
        onMoveToZone={moveToZone}
        onRemove={removeFromSidebar}
        warning={null}
      />

      <AvailableCard available={available} onAdd={addToZone} />

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

// ── Zone (topbar или list) ────────────────────────────────────────────────────

function ZoneCard({
  title,
  description,
  emptyHint,
  slots,
  boards,
  zone,
  onMove,
  onSetBadge,
  onMoveToZone,
  onRemove,
  warning,
}: {
  title: string
  description: string
  emptyHint: string
  slots: SidebarSlot[]
  boards: { id: string; name: string }[]
  zone: SidebarPlacement
  onMove: (id: string, delta: -1 | 1) => void
  onSetBadge: (id: string, mode: SidebarBadgeMode) => void
  onMoveToZone: (id: string, placement: SidebarPlacement) => void
  onRemove: (id: string) => void
  warning: string | null
}) {
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
              const label =
                slot.type === 'nav'
                  ? SIDEBAR_NAV_ITEMS[navKeyFromSlotId(slot.id)!].label
                  : (boards.find((b) => b.id === boardIdFromSlotId(slot.id))?.name ??
                    '— удалённая доска —')
              const Icon =
                slot.type === 'nav'
                  ? SIDEBAR_NAV_ITEMS[navKeyFromSlotId(slot.id)!].icon
                  : Kanban
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

// ── Available pool ────────────────────────────────────────────────────────────

function AvailableCard({
  available,
  onAdd,
}: {
  available: AvailableEntry[]
  onAdd: (entry: AvailableEntry, placement: SidebarPlacement) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Доступные</CardTitle>
        <CardDescription>
          Элементы, которые сейчас не в сайдбаре. Нажми «в верх» или «в список», чтобы добавить.
          Доски попадают сюда автоматически — открепить = вернуть сюда.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {available.length === 0 ? (
          <div className="text-sm text-gray-500 rounded-md border border-dashed border-gray-300 px-3 py-4 text-center">
            Все элементы уже размещены.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-md border border-dashed border-gray-300 bg-gray-50/40">
            {available.map((entry) => {
              const Icon =
                entry.kind === 'nav' ? SIDEBAR_NAV_ITEMS[entry.navKey].icon : Kanban
              return (
                <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Icon className="w-4 h-4 shrink-0 text-gray-400" />
                  <div className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                    {entry.label}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onAdd(entry, 'topbar')}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    в верх
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onAdd(entry, 'list')}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    в список
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

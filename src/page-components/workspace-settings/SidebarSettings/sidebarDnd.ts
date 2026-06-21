/**
 * Чистые хелперы перемещений для WYSIWYG-редактора сайдбара (DnD).
 *
 * Контейнеры: `zone:topbar`, `zone:list`, `fbody:<folderSlotId>` (тело папки),
 * `palette`. Тело папки имеет отдельный префикс, чтобы не конфликтовать с id
 * самого слота-папки (`folder:<uuid>`), который остаётся sortable-элементом зоны.
 * Слоты привязываются к контейнеру через placement + parent_id. Хелперы строят
 * списки по контейнерам, двигают элемент и пересобирают плоский массив слотов
 * с пересчётом order (порядок = позиция в списке контейнера).
 */

import {
  reorderWithinZones,
  type SidebarPlacement,
  type SidebarSlot,
} from '@/lib/sidebarSettings'

export const ZONE_TOPBAR = 'zone:topbar'
export const ZONE_LIST = 'zone:list'
export const PALETTE = 'palette'

export const FOLDER_BODY_PREFIX = 'fbody:'

export function containerForSlot(slot: SidebarSlot): string {
  if (slot.parent_id) return `${FOLDER_BODY_PREFIX}${slot.parent_id}`
  return `zone:${slot.placement}`
}

function buildLists(slots: SidebarSlot[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const sorted = [...slots].sort((a, b) => a.order - b.order)
  for (const s of sorted) {
    const c = containerForSlot(s)
    if (!map.has(c)) map.set(c, [])
    map.get(c)!.push(s.id)
  }
  return map
}

function placementOfFolder(lists: Map<string, string[]>, fid: string): SidebarPlacement {
  if (lists.get(ZONE_TOPBAR)?.includes(fid)) return 'topbar'
  return 'list'
}

function rebuild(slots: SidebarSlot[], lists: Map<string, string[]>): SidebarSlot[] {
  const byId = new Map(slots.map((s) => [s.id, s]))
  const out: SidebarSlot[] = []
  for (const [container, ids] of lists) {
    let placement: SidebarPlacement
    let parent: string | null
    if (container === ZONE_TOPBAR) {
      placement = 'topbar'
      parent = null
    } else if (container === ZONE_LIST) {
      placement = 'list'
      parent = null
    } else {
      const fid = container.slice(FOLDER_BODY_PREFIX.length)
      parent = fid
      placement = placementOfFolder(lists, fid)
    }
    ids.forEach((id, idx) => {
      const s = byId.get(id)
      if (s) out.push({ ...s, placement, parent_id: parent, order: idx })
    })
  }
  return out
}

/** Контейнер по id, на который навели (slot id → его контейнер; container id → он сам). */
export function resolveContainer(slots: SidebarSlot[], overId: string): string | null {
  if (overId === PALETTE) return PALETTE
  if (
    overId === ZONE_TOPBAR ||
    overId === ZONE_LIST ||
    overId.startsWith(FOLDER_BODY_PREFIX)
  ) {
    return overId
  }
  const s = slots.find((x) => x.id === overId)
  return s ? containerForSlot(s) : null
}

/** Переместить существующий слот в контейнер (перед beforeId или в конец). */
export function applyMove(
  slots: SidebarSlot[],
  activeId: string,
  targetContainer: string,
  beforeId: string | null,
): SidebarSlot[] {
  const lists = buildLists(slots)
  for (const ids of lists.values()) {
    const i = ids.indexOf(activeId)
    if (i >= 0) ids.splice(i, 1)
  }
  if (!lists.has(targetContainer)) lists.set(targetContainer, [])
  const target = lists.get(targetContainer)!
  let idx = target.length
  if (beforeId && beforeId !== activeId) {
    const bi = target.indexOf(beforeId)
    if (bi >= 0) idx = bi
  }
  target.splice(idx, 0, activeId)
  return rebuild(slots, lists)
}

/** Добавить новый слот в контейнер. */
export function applyAdd(
  slots: SidebarSlot[],
  newSlot: SidebarSlot,
  targetContainer: string,
  beforeId: string | null,
): SidebarSlot[] {
  const lists = buildLists(slots)
  if (!lists.has(targetContainer)) lists.set(targetContainer, [])
  const target = lists.get(targetContainer)!
  let idx = target.length
  if (beforeId) {
    const bi = target.indexOf(beforeId)
    if (bi >= 0) idx = bi
  }
  target.splice(idx, 0, newSlot.id)
  return rebuild([...slots, newSlot], lists)
}

/** Убрать слот из сайдбара; дети папки всплывают на верхний уровень той же зоны. */
export function applyRemove(slots: SidebarSlot[], slotId: string): SidebarSlot[] {
  const target = slots.find((s) => s.id === slotId)
  if (!target) return slots
  const cleared = slots
    .filter((s) => s.id !== slotId)
    .map((s) =>
      target.type === 'folder' && s.parent_id === slotId ? { ...s, parent_id: null } : s,
    )
  return reorderWithinZones(cleared)
}

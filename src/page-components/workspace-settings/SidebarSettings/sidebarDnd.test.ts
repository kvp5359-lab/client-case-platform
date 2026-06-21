import { describe, it, expect } from 'vitest'
import type { SidebarSlot } from '@/lib/sidebarSettings'
import {
  ZONE_LIST,
  ZONE_TOPBAR,
  PALETTE,
  applyAdd,
  applyMove,
  applyRemove,
  containerForSlot,
  resolveContainer,
} from './sidebarDnd'

function base(): SidebarSlot[] {
  return [
    { id: 'nav:home', type: 'nav', placement: 'topbar', order: 0, badge_mode: 'disabled' },
    { id: 'nav:inbox', type: 'nav', placement: 'list', order: 0, badge_mode: 'disabled' },
    { id: 'nav:tasks', type: 'nav', placement: 'list', order: 1, badge_mode: 'disabled' },
    {
      id: 'folder:F1',
      type: 'folder',
      placement: 'list',
      order: 2,
      badge_mode: 'disabled',
      name: 'Папка',
      parent_id: null,
    },
    {
      id: 'nav:boards',
      type: 'nav',
      placement: 'list',
      order: 0,
      badge_mode: 'disabled',
      parent_id: 'folder:F1',
    },
  ]
}

const byId = (slots: SidebarSlot[], id: string) => slots.find((s) => s.id === id)!

describe('containerForSlot / resolveContainer', () => {
  it('маппит слот в его контейнер', () => {
    const slots = base()
    expect(containerForSlot(byId(slots, 'nav:home'))).toBe(ZONE_TOPBAR)
    expect(containerForSlot(byId(slots, 'nav:inbox'))).toBe(ZONE_LIST)
    expect(containerForSlot(byId(slots, 'nav:boards'))).toBe('fbody:folder:F1')
  })

  it('resolveContainer: id контейнера → он сам, id слота → его контейнер', () => {
    const slots = base()
    expect(resolveContainer(slots, ZONE_TOPBAR)).toBe(ZONE_TOPBAR)
    // id слота-папки = наводка на заголовок → контейнер-зона (вставка рядом), не тело папки
    expect(resolveContainer(slots, 'folder:F1')).toBe(ZONE_LIST)
    expect(resolveContainer(slots, PALETTE)).toBe(PALETTE)
    expect(resolveContainer(slots, 'nav:tasks')).toBe(ZONE_LIST)
    expect(resolveContainer(slots, 'nav:boards')).toBe('fbody:folder:F1')
    expect(resolveContainer(slots, 'fbody:folder:F1')).toBe('fbody:folder:F1')
    expect(resolveContainer(slots, 'nope')).toBeNull()
  })
})

describe('applyMove', () => {
  it('реордерит внутри зоны (tasks перед inbox)', () => {
    const next = applyMove(base(), 'nav:tasks', ZONE_LIST, 'nav:inbox')
    const list = next
      .filter((s) => s.placement === 'list' && !s.parent_id)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.id)
    expect(list).toEqual(['nav:tasks', 'nav:inbox', 'folder:F1'])
  })

  it('переносит слот в другую зону (inbox → topbar) и меняет placement', () => {
    const next = applyMove(base(), 'nav:inbox', ZONE_TOPBAR, null)
    expect(byId(next, 'nav:inbox').placement).toBe('topbar')
    expect(byId(next, 'nav:inbox').parent_id ?? null).toBeNull()
  })

  it('втаскивает слот в папку: parent_id + placement папки', () => {
    const next = applyMove(base(), 'nav:tasks', 'fbody:folder:F1', null)
    expect(byId(next, 'nav:tasks').parent_id).toBe('folder:F1')
    expect(byId(next, 'nav:tasks').placement).toBe('list')
  })

  it('перенос папки в другую зону тащит её детей (placement)', () => {
    const next = applyMove(base(), 'folder:F1', ZONE_TOPBAR, null)
    expect(byId(next, 'folder:F1').placement).toBe('topbar')
    expect(byId(next, 'nav:boards').placement).toBe('topbar')
    expect(byId(next, 'nav:boards').parent_id).toBe('folder:F1')
  })
})

describe('applyAdd', () => {
  it('добавляет новый слот в зону', () => {
    const newSlot: SidebarSlot = {
      id: 'nav:calendar',
      type: 'nav',
      placement: 'list',
      order: 0,
      badge_mode: 'disabled',
    }
    const next = applyAdd(base(), newSlot, ZONE_TOPBAR, null)
    expect(byId(next, 'nav:calendar').placement).toBe('topbar')
  })
})

describe('applyRemove', () => {
  it('удаляет слот', () => {
    const next = applyRemove(base(), 'nav:inbox')
    expect(byId(next, 'nav:inbox' as string)).toBeUndefined()
  })

  it('при удалении папки её дети всплывают на верхний уровень', () => {
    const next = applyRemove(base(), 'folder:F1')
    expect(next.find((s) => s.id === 'folder:F1')).toBeUndefined()
    expect(byId(next, 'nav:boards').parent_id ?? null).toBeNull()
    expect(byId(next, 'nav:boards').placement).toBe('list')
  })
})

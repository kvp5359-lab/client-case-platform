import { describe, it, expect } from 'vitest'
import {
  WORKSPACE_PERMISSION_DEFS,
  WORKSPACE_PERMISSION_KEYS,
  WORKSPACE_PERM_GROUPS,
  emptyWorkspacePermissions,
  PROJECT_MODULE_DEFS,
  PROJECT_ACTION_GROUPS,
} from './registry'

describe('permissions registry', () => {
  it('ключи прав уникальны', () => {
    expect(WORKSPACE_PERMISSION_KEYS.length).toBe(new Set(WORKSPACE_PERMISSION_KEYS).size)
  })

  it('emptyWorkspacePermissions отдаёт все ключи в false', () => {
    const empty = emptyWorkspacePermissions()
    expect(Object.keys(empty).length).toBe(WORKSPACE_PERMISSION_KEYS.length)
    for (const k of WORKSPACE_PERMISSION_KEYS) {
      expect(empty[k]).toBe(false)
    }
  })

  it('каждая группа прав непуста и у каждого права валидная группа', () => {
    const groupIds = new Set(WORKSPACE_PERM_GROUPS.map((g) => g.id))
    for (const g of WORKSPACE_PERM_GROUPS) {
      expect(WORKSPACE_PERMISSION_DEFS.some((d) => d.group === g.id)).toBe(true)
    }
    for (const d of WORKSPACE_PERMISSION_DEFS) {
      expect(groupIds.has(d.group)).toBe(true)
    }
  })

  it('новые ключи (разделы + действия задач/чатов) присутствуют', () => {
    for (const k of [
      'view_source_updates',
      'view_inbox',
      'view_finance',
      'delete_own_task',
      'delete_any_task',
      'delete_own_message',
      'delete_any_message',
    ] as const) {
      expect(WORKSPACE_PERMISSION_KEYS).toContain(k)
    }
  })

  it('ключи модулей проекта уникальны, действия внутри групп — тоже', () => {
    const mods = PROJECT_MODULE_DEFS.map((d) => d.key)
    expect(mods.length).toBe(new Set(mods).size)
    for (const grp of PROJECT_ACTION_GROUPS) {
      const keys = grp.actions.map((a) => a.key)
      expect(keys.length).toBe(new Set(keys).size)
    }
  })
})

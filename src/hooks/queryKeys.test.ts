/**
 * Тесты для фабрик query keys
 */

import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'
import {
  formKitKeys,
  documentKitKeys,
  projectKeys,
  folderSlotKeys,
  folderTemplateSlotKeys,
  statusKeys,
  contactThreadKeys,
  sidebarMetaKeys,
  myTaskCountsKeys,
  workspaceThreadKeys,
  accessibleProjectKeys,
  messengerKeys,
  inboxKeys,
  personalDialogsKeys,
  invalidateAfterThreadMove,
} from './queryKeys'

describe('formKitKeys', () => {
  it('all возвращает ["form-kit"]', () => {
    expect(formKitKeys.all).toEqual(['form-kit'])
  })

  it('byId включает formKitId', () => {
    expect(formKitKeys.byId('fk-1')).toEqual(['form-kit', 'fk-1'])
  })

  it('detail включает "detail"', () => {
    expect(formKitKeys.detail('fk-1')).toEqual(['form-kit', 'fk-1', 'detail'])
  })

  it('structure возвращает корректный ключ', () => {
    expect(formKitKeys.structure('fk-1')).toEqual(['form-kit', 'fk-1', 'structure'])
  })

  it('fieldValues возвращает корректный ключ', () => {
    expect(formKitKeys.fieldValues('fk-1')).toEqual(['form-kit', 'fk-1', 'field-values'])
  })

  it('compositeItems возвращает корректный ключ', () => {
    expect(formKitKeys.compositeItems('fk-1')).toEqual(['form-kit', 'fk-1', 'composite-items'])
  })

  it('selectOptions возвращает корректный ключ', () => {
    expect(formKitKeys.selectOptions('fk-1')).toEqual(['form-kit', 'fk-1', 'select-options'])
  })
})

describe('documentKitKeys', () => {
  it('all возвращает ["documentKits"]', () => {
    expect(documentKitKeys.all).toEqual(['documentKits'])
  })

  it('byProject включает projectId', () => {
    expect(documentKitKeys.byProject('proj-1')).toEqual(['documentKits', 'proj-1'])
  })
})

describe('projectKeys', () => {
  it('all возвращает ["projects"]', () => {
    expect(projectKeys.all).toEqual(['projects'])
  })

  it('detail включает projectId', () => {
    expect(projectKeys.detail('proj-1')).toEqual(['projects', 'proj-1'])
  })

  it('folderCheck включает projectId', () => {
    expect(projectKeys.folderCheck('proj-1')).toEqual(['projects', 'folder-check', 'proj-1'])
  })
})

describe('folderSlotKeys', () => {
  it('all возвращает ["folder-slots"]', () => {
    expect(folderSlotKeys.all).toEqual(['folder-slots'])
  })

  it('byProject включает projectId', () => {
    expect(folderSlotKeys.byProject('proj-1')).toEqual(['folder-slots', 'proj-1'])
  })

  it('byProjectForTasks включает projectId и суффикс tasks', () => {
    expect(folderSlotKeys.byProjectForTasks('proj-1')).toEqual(['folder-slots', 'proj-1', 'tasks'])
  })
})

describe('folderTemplateSlotKeys', () => {
  it('all возвращает ["folder-template-slots"]', () => {
    expect(folderTemplateSlotKeys.all).toEqual(['folder-template-slots'])
  })

  it('byTemplate включает templateId', () => {
    expect(folderTemplateSlotKeys.byTemplate('tmpl-1')).toEqual(['folder-template-slots', 'tmpl-1'])
  })
})

describe('statusKeys', () => {
  it('document возвращает корректный ключ', () => {
    expect(statusKeys.document('ws-1')).toEqual(['statuses', 'document', 'ws-1'])
  })

  it('documentKit возвращает корректный ключ', () => {
    expect(statusKeys.documentKit('ws-1')).toEqual(['statuses', 'document_kit', 'ws-1'])
  })
})

describe('contactThreadKeys', () => {
  it('all — broad-invalidate prefix', () => {
    expect(contactThreadKeys.all).toEqual(['contact-threads'])
  })

  it('byParticipant включает participantId', () => {
    expect(contactThreadKeys.byParticipant('p-1')).toEqual(['contact-threads', 'p-1'])
  })
})

describe('sidebarMetaKeys', () => {
  it('templatesIcons включает workspaceId', () => {
    expect(sidebarMetaKeys.templatesIcons('ws-1')).toEqual([
      'sidebar',
      'workspace-templates-icons',
      'ws-1',
    ])
  })

  it('templatesIconsAll — prefix без workspaceId, для broad-invalidate', () => {
    expect(sidebarMetaKeys.templatesIconsAll).toEqual([
      'sidebar',
      'workspace-templates-icons',
    ])
  })

  it('statusesColors включает workspaceId', () => {
    expect(sidebarMetaKeys.statusesColors('ws-1')).toEqual([
      'sidebar',
      'workspace-statuses-colors',
      'ws-1',
    ])
  })
})

describe('myTaskCountsKeys', () => {
  it('all — префикс для broad-invalidate', () => {
    expect(myTaskCountsKeys.all).toEqual(['my-task-counts'])
  })

  it('byWorkspace включает workspaceId', () => {
    expect(myTaskCountsKeys.byWorkspace('ws-1')).toEqual(['my-task-counts', 'ws-1'])
  })
})

/**
 * invalidateAfterThreadMove — общий пакет инвалидаций после перемещения треда
 * между контекстами. Тест регрессионный: проверяем что ключи реально
 * совпадают с теми, которые используют другие части queryKeys.ts.
 *
 * До Phase 12 в `useMoveThreadToProject` и `useMergeParticipants` руками
 * инвалидировались `['threads']` и `['workspace', wsId]` — ни один реальный
 * ключ не начинался с этих префиксов, и инвалидации фактически были no-op.
 */
describe('invalidateAfterThreadMove', () => {
  it('инвалидирует messenger / personal-dialogs / inbox / contact-threads префиксами', () => {
    const qc = { invalidateQueries: vi.fn() }
    invalidateAfterThreadMove(qc, undefined)
    const calls = qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey)
    expect(calls).toContainEqual(messengerKeys.all)
    expect(calls).toContainEqual(personalDialogsKeys.all)
    expect(calls).toContainEqual(inboxKeys.all)
    expect(calls).toContainEqual(contactThreadKeys.all)
    expect(calls).toContainEqual(['sidebar'])
  })

  it('при наличии workspaceId инвалидирует ещё и workspace-scoped ключи', () => {
    const qc = { invalidateQueries: vi.fn() }
    invalidateAfterThreadMove(qc, 'ws-1')
    const calls = qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey)
    expect(calls).toContainEqual(workspaceThreadKeys.workspace('ws-1'))
    expect(calls).toContainEqual(projectKeys.byWorkspace('ws-1'))
    expect(calls).toContainEqual(accessibleProjectKeys.workspace('ws-1'))
    expect(calls).toContainEqual(myTaskCountsKeys.byWorkspace('ws-1'))
  })

  it('без workspaceId — не дёргает workspace-scoped invalidations', () => {
    const qc = { invalidateQueries: vi.fn() }
    invalidateAfterThreadMove(qc, undefined)
    const calls = qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey)
    // Ни один из вызовов не должен быть workspace-scoped (длина ≤ 1 для broad)
    const wsScoped = calls.filter((k) => Array.isArray(k) && k.includes('ws-1'))
    expect(wsScoped).toEqual([])
  })
})

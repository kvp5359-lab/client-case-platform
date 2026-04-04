/**
 * Тесты для фабрик query keys
 */

import { describe, it, expect } from 'vitest'
import {
  formKitKeys,
  documentKitKeys,
  projectKeys,
  folderSlotKeys,
  folderTemplateSlotKeys,
  statusKeys,
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

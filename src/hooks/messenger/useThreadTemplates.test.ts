import { describe, it, expect } from 'vitest'
import { mapJunctionRow, type JunctionRow } from './useThreadTemplates'
import type { ThreadTemplate } from '@/types/threadTemplate'

// Минимальная «рыба» общего шаблона. Поля, не участвующие в проверках,
// заполнены безопасными значениями; каст точечный (тестовая фикстура).
function baseTemplate(over: Partial<ThreadTemplate> = {}): ThreadTemplate {
  return {
    id: 'tt-1',
    workspace_id: 'ws-1',
    name: 'Финмодель',
    thread_type: 'task',
    sort_order: 0,
    // глобальное task_group_id «рыбы» — должно перебиваться junction-значением
    task_group_id: 'global-group',
    default_status_id: null,
    on_complete_set_project_status_id: null,
    ...over,
  } as ThreadTemplate
}

function junction(over: Partial<JunctionRow> = {}): JunctionRow {
  return {
    id: 'binding-1',
    sort_order: 5,
    default_status_id: 'status-x',
    on_complete_set_project_status_id: 'status-done',
    deadline_days: null,
    initial_message_html: null,
    access_type: null,
    access_roles: null,
    assignees_mode: 'inherit',
    task_group_id: 'junction-group',
    thread_templates: baseTemplate(),
    ...over,
  }
}

describe('mapJunctionRow', () => {
  it('группа берётся из junction, а не из глобального поля «рыбы»', () => {
    const r = mapJunctionRow(junction({ task_group_id: 'junction-group' }), [])
    expect(r?.task_group_id).toBe('junction-group')
  })

  it('junction.task_group_id=null → задача без группы (глобальное поле не всплывает)', () => {
    const r = mapJunctionRow(
      junction({ task_group_id: null, thread_templates: baseTemplate({ task_group_id: 'global-group' }) }),
      [],
    )
    expect(r?.task_group_id).toBeNull()
  })

  it('пер-проектные поля (sort_order/статусы) берутся из junction', () => {
    const r = mapJunctionRow(junction(), [])
    expect(r?.sort_order).toBe(5)
    expect(r?.default_status_id).toBe('status-x')
    expect(r?.on_complete_set_project_status_id).toBe('status-done')
  })

  it('базовые поля «рыбы» сохраняются; projectOverride несёт bindingId и режим исполнителей', () => {
    const r = mapJunctionRow(junction({ assignees_mode: 'override' }), ['p1', 'p2'])
    expect(r?.name).toBe('Финмодель')
    expect(r?.projectOverride?.bindingId).toBe('binding-1')
    expect(r?.projectOverride?.assignees_overridden).toBe(true)
    expect(r?.projectOverride?.override_assignee_ids).toEqual(['p1', 'p2'])
  })

  it('нет связанной «рыбы» → null', () => {
    expect(mapJunctionRow(junction({ thread_templates: null }), [])).toBeNull()
  })
})

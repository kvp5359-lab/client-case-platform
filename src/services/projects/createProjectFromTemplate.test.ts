import { describe, it, expect } from 'vitest'
import { buildPlanSeed } from './createProjectFromTemplate'
import type { ThreadTemplate } from '@/types/threadTemplate'

// Минимальная фабрика шаблона треда — для buildPlanSeed важны только id и sort_order.
function tpl(id: string, sort_order: number): ThreadTemplate {
  return { id, sort_order } as unknown as ThreadTemplate
}

function block(id: string, sort_order: number, block_type: 'heading' | 'text' = 'text') {
  return { id, sort_order, block_type, visible_to_client: true, content: `c-${id}` }
}

describe('buildPlanSeed', () => {
  it('переплетает задачи и блоки по общей шкале sort_order, нумеруя заново', () => {
    const threadByTemplate = new Map([
      ['t1', 'thread-1'],
      ['t2', 'thread-2'],
    ])
    const { taskOrder, planRows } = buildPlanSeed({
      workspaceId: 'ws',
      projectId: 'proj',
      selectedThreadTemplates: [tpl('t1', 0), tpl('t2', 20)],
      contentBlocks: [block('b1', 10, 'heading')],
      threadByTemplate,
    })

    // Порядок: t1(0) → b1(10) → t2(20). Индексы 0,1,2.
    expect(taskOrder).toEqual([
      { threadId: 'thread-1', index: 0 },
      { threadId: 'thread-2', index: 2 },
    ])
    expect(planRows).toHaveLength(1)
    expect(planRows[0]).toMatchObject({
      workspace_id: 'ws',
      project_id: 'proj',
      block_type: 'heading',
      sort_order: 1,
      visible_to_client: true,
      content: 'c-b1',
    })
  })

  it('при равном sort_order задача идёт перед блоком', () => {
    const { taskOrder, planRows } = buildPlanSeed({
      workspaceId: 'ws',
      projectId: 'proj',
      selectedThreadTemplates: [tpl('t1', 5)],
      contentBlocks: [block('b1', 5)],
      threadByTemplate: new Map([['t1', 'thread-1']]),
    })
    expect(taskOrder[0]).toEqual({ threadId: 'thread-1', index: 0 })
    expect(planRows[0].sort_order).toBe(1)
  })

  it('пропускает шаблоны без созданного треда (нет в threadByTemplate)', () => {
    const { taskOrder, planRows } = buildPlanSeed({
      workspaceId: 'ws',
      projectId: 'proj',
      selectedThreadTemplates: [tpl('t1', 0), tpl('t2', 10)],
      contentBlocks: [block('b1', 5)],
      threadByTemplate: new Map([['t1', 'thread-1']]), // t2 не создан
    })
    expect(taskOrder).toEqual([{ threadId: 'thread-1', index: 0 }])
    // b1(5) идёт после t1(0): индекс 1.
    expect(planRows[0].sort_order).toBe(1)
  })

  it('без блоков возвращает только taskOrder', () => {
    const { taskOrder, planRows } = buildPlanSeed({
      workspaceId: 'ws',
      projectId: 'proj',
      selectedThreadTemplates: [tpl('t1', 0)],
      contentBlocks: [],
      threadByTemplate: new Map([['t1', 'thread-1']]),
    })
    expect(taskOrder).toEqual([{ threadId: 'thread-1', index: 0 }])
    expect(planRows).toEqual([])
  })
})

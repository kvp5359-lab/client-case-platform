import { describe, it, expect } from 'vitest'
import {
  groupContactThreads,
  filterContactThreads,
  type GroupableThread,
} from './contactThreadGrouping'

function thread(over: Partial<GroupableThread> & { name: string }): GroupableThread {
  return {
    project_id: null,
    project_name: null,
    project_name_prefix: null,
    last_message_at: null,
    ...over,
  }
}

describe('groupContactThreads', () => {
  it('делит на личные (без проекта) и группы по проектам', () => {
    const { personal, projects } = groupContactThreads([
      thread({ name: 'Личный TG' }),
      thread({ name: 'Задача A', project_id: 'p1', project_name: 'Проект 1' }),
      thread({ name: 'Задача B', project_id: 'p1', project_name: 'Проект 1' }),
    ])
    expect(personal.map((t) => t.name)).toEqual(['Личный TG'])
    expect(projects).toHaveLength(1)
    expect(projects[0].projectId).toBe('p1')
    expect(projects[0].threads.map((t) => t.name)).toEqual(['Задача A', 'Задача B'])
  })

  it('порядок групп = первое появление проекта во входе', () => {
    const { projects } = groupContactThreads([
      thread({ name: 'a', project_id: 'p2', project_name: 'Второй' }),
      thread({ name: 'b', project_id: 'p1', project_name: 'Первый' }),
      thread({ name: 'c', project_id: 'p2', project_name: 'Второй' }),
    ])
    expect(projects.map((g) => g.projectId)).toEqual(['p2', 'p1'])
  })

  it('lastMessageAt группы = максимум по тредам, не зависит от порядка входа', () => {
    const { projects } = groupContactThreads([
      thread({ name: 'старое', project_id: 'p1', last_message_at: '2026-01-01T00:00:00Z' }),
      thread({ name: 'свежее', project_id: 'p1', last_message_at: '2026-07-10T00:00:00Z' }),
      thread({ name: 'среднее', project_id: 'p1', last_message_at: '2026-03-01T00:00:00Z' }),
    ])
    expect(projects[0].lastMessageAt).toBe('2026-07-10T00:00:00Z')
  })

  it('lastMessageAt null-безопасен (все даты null → null)', () => {
    const { projects } = groupContactThreads([
      thread({ name: 'x', project_id: 'p1', last_message_at: null }),
    ])
    expect(projects[0].lastMessageAt).toBeNull()
  })

  it('фолбэк имени проекта "Проект" при отсутствии, префикс переносится', () => {
    const { projects } = groupContactThreads([
      thread({ name: 'x', project_id: 'p1', project_name: null, project_name_prefix: 'СР:' }),
    ])
    expect(projects[0].projectName).toBe('Проект')
    expect(projects[0].namePrefix).toBe('СР:')
  })
})

describe('filterContactThreads', () => {
  const list = [
    thread({ name: 'Договор', project_id: 'p1', project_name: 'Юрий Волчек' }),
    thread({ name: 'Встреча', project_id: 'p2', project_name: 'Наталья Шамина' }),
    thread({ name: 'Личное письмо' }),
  ]

  it('пустой/пробельный запрос → исходный массив (та же ссылка)', () => {
    expect(filterContactThreads(list, '')).toBe(list)
    expect(filterContactThreads(list, '   ')).toBe(list)
  })

  it('совпадение по названию треда (регистронезависимо)', () => {
    expect(filterContactThreads(list, 'договор').map((t) => t.name)).toEqual(['Договор'])
  })

  it('совпадение по названию проекта', () => {
    expect(filterContactThreads(list, 'волчек').map((t) => t.name)).toEqual(['Договор'])
  })

  it('нет совпадений → пустой массив', () => {
    expect(filterContactThreads(list, 'zzz')).toEqual([])
  })
})
